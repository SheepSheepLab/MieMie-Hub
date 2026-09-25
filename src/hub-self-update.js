import {updatedScriptName} from './script-update-fields.js';
import {registryBaseURL} from './registry-client.js';
import {compareSemVer} from './hub-update-check.js';
import {parseHubBuildIdentity} from './hub-script-host.js';

// Only public release bytes leave/enter this transport. Host credentials and
// settings belong exclusively to the separate same-origin persistence reader.
export const HUB_UPDATE_REPOSITORY_API = 'https://api.github.com/repos/SheepSheepLab/MieMie-Hub';
export const HUB_UPDATE_PACKAGE_ID = 'e85cd9a3-6352-4b23-938a-6c94d826b4d3';
export const HUB_UPDATE_PENDING_KEY = 'miemie_hub_update_pending_v1';
export const HUB_UPDATE_METADATA_LIMIT = 64 * 1024;
export const HUB_UPDATE_ASSET_LIMIT = 16 * 1024 * 1024;
const hubUpdateHashPattern = /^[a-f0-9]{64}$(?![\s\S])/;
const hubUpdateVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$(?![\s\S])/;
const hubUpdateBusyStates = new Set(['preparing', 'downloading', 'verifying', 'installing', 'awaiting-reload', 'confirming']);
function hubUpdateFail(code, message) { return Object.assign(Error(message), {code, hubSelfUpdateError: true}); }
function hubUpdateObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function hubUpdateId(value) { return Number.isSafeInteger(value) && value > 0; }
function hubUpdateVersion(value) { return typeof value === 'string' && hubUpdateVersionPattern.test(value) && !value.endsWith('\n'); }

export async function hashHubUpdateBytes(bytes, crypto = globalThis.crypto) {
  if (!crypto?.subtle?.digest) throw hubUpdateFail('crypto', '当前浏览器无法进行 SHA-256 校验，请使用 HTTPS 或 localhost；未安装更新。');
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(result)].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function hubUpdateDeadline(action, milliseconds, parentSignal) {
  parentSignal?.throwIfAborted();
  const controller = new AbortController();
  let timer, cancel;
  const cancelled = new Promise((_, reject) => { cancel = error => {controller.abort(error); reject(error);}; });
  const onAbort = () => cancel(hubUpdateFail('cancelled', '更新已取消。'));
  parentSignal?.addEventListener('abort', onAbort, {once: true});
  timer = setTimeout(() => cancel(hubUpdateFail('timeout', '更新请求超时；未确认安装成功，请重试。')), milliseconds);
  try { return await Promise.race([Promise.resolve().then(() => action(controller.signal)), cancelled]); }
  finally {clearTimeout(timer); parentSignal?.removeEventListener('abort', onAbort);}
}

async function hubUpdateReadBytes(response, limit, signal, expectedSize, allowError = false) {
  if ((!response?.ok && !allowError) || response.type === 'opaque' || response.type === 'opaqueredirect') {
    throw hubUpdateFail('http', '无法读取更新文件' + (response?.status ? '（HTTP ' + response.status + '）' : '') + '。');
  }
  const length = response.headers?.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw hubUpdateFail('size', '更新响应超过大小限制。');
  // Require streaming: an unbounded arrayBuffer fallback could allocate arbitrary
  // memory before the size check, even if a server omits Content-Length.
  if (!response.body?.getReader) throw hubUpdateFail('stream', '当前浏览器不支持安全读取更新文件。');
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  const onAbort = () => {void reader.cancel().catch(() => {});};
  signal.addEventListener('abort', onAbort, {once: true});
  try {
    for (;;) {
      signal.throwIfAborted();
      const {value, done} = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit || (expectedSize !== undefined && size > expectedSize)) throw hubUpdateFail('size', '更新文件大小不符合发布记录。');
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    void reader.cancel().catch(() => {});
  }
  if (!size || (expectedSize !== undefined && size !== expectedSize)) throw hubUpdateFail('size', '更新文件大小不符合发布记录。');
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
  return bytes;
}

function hubUpdateParseJSON(bytes) {
  try { return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
  catch (_) { throw hubUpdateFail('json', '更新文件不是有效的 UTF-8 JSON。'); }
}

function hubUpdateCheckAsset(asset, name, limit, tag) {
  if (!hubUpdateObject(asset) || !hubUpdateId(asset.id) || asset.name !== name || asset.state !== 'uploaded' ||
      !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > limit ||
      typeof asset.digest !== 'string' || !/^sha256:[a-f0-9]{64}$(?![\s\S])/.test(asset.digest) ||
      asset.url !== HUB_UPDATE_REPOSITORY_API + '/releases/assets/' + asset.id ||
      asset.browser_download_url !== 'https://github.com/SheepSheepLab/MieMie-Hub/releases/download/' + tag + '/' + name) {
    throw hubUpdateFail('asset', 'Release 附件身份、大小或 SHA-256 信息不完整；拒绝更新。');
  }
  return {id: asset.id, name, size: asset.size, sha256: asset.digest.slice(7), url: asset.url};
}

export function validateHubUpdateRelease(release, target) {
  if (!hubUpdateObject(target) || !hubUpdateId(target.releaseId) || !hubUpdateVersion(target.version) || target.tag !== 'v' + target.version ||
      !hubUpdateObject(release) || release.id !== target.releaseId || release.tag_name !== target.tag || release.draft !== false || !Array.isArray(release.assets)) {
    throw hubUpdateFail('release', '目标 Release 已变化或版本格式不受支持，请重新检查更新。');
  }
  const name = 'MieMie-Hub-' + target.version + '.json';
  const exact = name => {
    const found = release.assets.filter(x => x?.name === name);
    if (found.length !== 1) throw hubUpdateFail('asset', 'Release 缺少唯一的 ' + name + ' 附件。');
    return found[0];
  };
  return {
    releaseId: target.releaseId, version: target.version, tag: target.tag,
    asset: hubUpdateCheckAsset(exact(name), name, HUB_UPDATE_ASSET_LIMIT, target.tag),
    metadata: hubUpdateCheckAsset(exact('MieMie-Hub-update.json'), 'MieMie-Hub-update.json', HUB_UPDATE_METADATA_LIMIT, target.tag),
  };
}

export function validateHubUpdateMetadata(metadata, release) {
  if (!hubUpdateObject(metadata) || metadata.schemaVersion !== 1 || metadata.productId !== 'miemie.hub' ||
      metadata.format !== 'tavern-helper-script' || metadata.scriptId !== HUB_UPDATE_PACKAGE_ID ||
      metadata.version !== release.version || metadata.tag !== release.tag || !hubUpdateObject(metadata.asset) ||
      metadata.asset.name !== release.asset.name || metadata.asset.size !== release.asset.size ||
      metadata.asset.sha256 !== release.asset.sha256 || typeof metadata.contentSha256 !== 'string' || !hubUpdateHashPattern.test(metadata.contentSha256)) {
    throw hubUpdateFail('metadata', '更新元数据的产品、版本或校验信息不一致。');
  }
  // Never interpret a metadata download URL (including future/unknown fields).
  const allowed = ['schemaVersion', 'productId', 'format', 'scriptId', 'version', 'tag', 'asset', 'contentSha256'];
  if (Object.keys(metadata).some(k => !allowed.includes(k)) || Object.keys(metadata.asset).some(k => !['name', 'size', 'sha256'].includes(k))) {
    throw hubUpdateFail('metadata', '更新元数据格式不受支持。');
  }
  return metadata;
}

export async function validateHubUpdatePackage(bytes, metadata, crypto = globalThis.crypto) {
  if (!bytes?.byteLength || bytes.byteLength > HUB_UPDATE_ASSET_LIMIT || bytes.byteLength !== metadata.asset.size ||
      await hashHubUpdateBytes(bytes, crypto) !== metadata.asset.sha256) throw hubUpdateFail('hash', 'Hub 文件大小或 SHA-256 不匹配；拒绝安装。');
  const script = hubUpdateParseJSON(bytes);
  if (!hubUpdateObject(script) || script.type !== 'script' || script.id !== HUB_UPDATE_PACKAGE_ID ||
      typeof script.name !== 'string' || typeof script.content !== 'string' || !script.content ||
      typeof script.enabled !== 'boolean' || typeof script.info !== 'string' || !hubUpdateObject(script.data) ||
      !hubUpdateObject(script.button) || typeof script.button.enabled !== 'boolean' || !Array.isArray(script.button.buttons) ||
      script.button.buttons.some(b => !hubUpdateObject(b) || typeof b.name !== 'string' || typeof b.visible !== 'boolean') ||
      !hubUpdateObject(script.export_with) || typeof script.export_with.data !== 'boolean' || typeof script.export_with.button !== 'boolean' ||
      Object.keys(script).some(k => !['type', 'id', 'name', 'content', 'enabled', 'info', 'data', 'button', 'export_with'].includes(k))) {
    throw hubUpdateFail('package', '下载内容不是受支持的 MieMie Hub 单脚本包。');
  }
  const identity = parseHubBuildIdentity(script.content);
  if (!identity || identity.productId !== metadata.productId || identity.scriptId !== metadata.scriptId || identity.version !== metadata.version) {
    throw hubUpdateFail('identity', '下载代码的 Hub 产品身份或版本不匹配。');
  }
  if (await hashHubUpdateBytes(new TextEncoder().encode(script.content), crypto) !== metadata.contentSha256) {
    throw hubUpdateFail('content-hash', 'Hub content SHA-256 不匹配；拒绝安装。');
  }
  return script;
}

async function hubUpdatePublicBytes(request, url, {signal, limit, size, binary = false, relay}) {
  let response, relayed = false;
  try {
    response = await request(url, {method: 'GET', headers: {Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json'},
      mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: binary ? 'follow' : 'error', signal});
  } catch (error) {
    signal.throwIfAborted();
    if (!binary || !relay?.base) throw hubUpdateFail('download', '无法读取 GitHub 更新文件（网络或 CORS 限制），且安全下载服务不可用；未安装更新，可手动下载官方 Release。');
    const endpoint = relay.base + '/api/hub/releases/asset';
    try {
      response = await request(endpoint, {method: 'POST', headers: {Accept: 'application/octet-stream', 'Content-Type': 'application/json'},
        body: JSON.stringify({releaseId: relay.releaseId, assetId: relay.assetId}), mode: 'cors', credentials: 'omit',
        referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store', signal});
    } catch (_) {signal.throwIfAborted(); throw hubUpdateFail('relay', '安全下载服务无法连接；未安装更新。');}
    signal.throwIfAborted();
    if (response?.url !== endpoint || response.redirected) throw hubUpdateFail('redirect', '安全下载服务响应地址变化；拒绝安装。');
    relayed = true;
    if (!response.ok && !['opaque', 'opaqueredirect'].includes(response.type)) {
      let detail;
      try {detail = hubUpdateParseJSON(await hubUpdateReadBytes(response, 16384, signal, undefined, true))?.error;} catch (_) {signal.throwIfAborted();}
      if (detail?.code === 'github_rate_limited') {
        const at = Date.parse(detail.retryAt);
        const when = Number.isFinite(at) && at > Date.now() && at < Date.now() + 86400000 ? new Date(at).toLocaleTimeString() : '稍后';
        throw hubUpdateFail('github_rate_limited', 'GitHub 匿名访问额度暂时用完，请在' + when + '重试；未安装更新。');
      }
      const errors = {origin_denied: '当前酒馆地址未获下载服务允许', release_changed: 'Release 在传输期间变化，请重新检查更新', upstream_timeout: '安全下载服务读取 GitHub 超时', invalid_package: '安全下载服务拒绝了无效更新包'};
      throw hubUpdateFail('relay', (errors[detail?.code] || '安全下载服务暂不可用（HTTP ' + response.status + '）') + '；未安装更新。');
    }
  }
  if (binary && !relayed) {
    let finalURL;
    try { finalURL = new URL(response.url); } catch (_) {}
    const officialHosts = ['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'];
    if (!finalURL || finalURL.protocol !== 'https:' || finalURL.username || finalURL.password || finalURL.port || !officialHosts.includes(finalURL.hostname)) {
      throw hubUpdateFail('redirect', '更新附件跳转到不受支持的地址；拒绝安装。');
    }
  }
  return hubUpdateReadBytes(response, limit, signal, size);
}

// This is a version-bounded SillyTavern 1.18 persistence readback, not a
// TavernHelper flush API. No settings are POSTed back or sent to GitHub.
export function createHubSavedScriptReader({fetch: request, origin, getRequestHeaders}) {
  return async function readSavedScript(id, signal) {
    if (typeof request !== 'function' || typeof getRequestHeaders !== 'function' || !/^https?:\/\//.test(origin || '')) {
      throw hubUpdateFail('persistence', '宿主未提供保存确认接口；请保留恢复文件并手动确认。');
    }
    const response = await request(new URL('/api/settings/get', origin).href, {
      method: 'POST', headers: getRequestHeaders(), body: '{}', credentials: 'same-origin',
      redirect: 'error', cache: 'no-store', signal,
    });
    const payload = hubUpdateParseJSON(await hubUpdateReadBytes(response, 64 * 1024 * 1024, signal));
    let settings;
    try { settings = JSON.parse(payload.settings); } catch (_) {throw hubUpdateFail('persistence', '无法读取宿主保存结果。');}
    const trees = settings?.extension_settings?.tavern_helper?.script?.scripts;
    if (!Array.isArray(trees)) throw hubUpdateFail('persistence', '宿主保存结构不受支持，尚未确认更新已保存。');
    const found = [];
    const visit = list => {for (const item of list) {
      if (item?.type === 'script' && item.id === id) found.push(item);
      else if (item?.type === 'folder' && Array.isArray(item.scripts)) visit(item.scripts);
    }};
    visit(trees);
    if (found.length > 1) throw hubUpdateFail('persistence', '保存记录中出现重复脚本 ID，无法确认。');
    if (!found.length) return null;
    const script = found[0];
    if (typeof script.content !== 'string' || typeof script.name !== 'string') throw hubUpdateFail('persistence', '宿主保存记录缺少代码或显示名称，未确认更新成功。');
    return {id: script.id, name: script.name, content: script.content};
  };
}

function hubUpdatePendingValid(record) {
  return hubUpdateObject(record) && record.schemaVersion === 1 && (record.scriptFieldsVersion === undefined || record.scriptFieldsVersion === 1) && record.scope === 'global' &&
    typeof record.id === 'string' && record.id.length > 0 && record.id.length <= 200 &&
    hubUpdateVersion(record.version) && hubUpdateVersion(record.previousVersion) &&
    hubUpdateId(record.releaseId) && hubUpdateId(record.assetId) &&
    ['contentSha256', 'assetSha256', 'previousContentSha256'].every(k => typeof record[k] === 'string' && hubUpdateHashPattern.test(record[k])) && Number.isFinite(record.createdAt);
}

export function createHubSelfUpdater({currentVersion, host, storage, backup, readSavedScript,
  fetch: request = (...args) => globalThis.fetch(...args), crypto = globalThis.crypto, getRegistryBaseURL = () => '',
  metadataTimeoutMs = 15000, assetTimeoutMs = 60000, confirmationTimeoutMs = 15000, confirmationIntervalMs = 500,
  now = () => Date.now()}) {
  let state = {status: 'idle', error: '', targetVersion: null, backupRequested: false};
  let task = null, disposed = false, reloadTimer;
  const listeners = new Set();
  function publish(next) {
    if (!disposed) {state = {...state, ...next}; for (const listener of listeners) {
      try {listener({...state});} catch (_) {console.warn('[MieMie Hub] 更新状态界面未能刷新。');}
    }}
    return {...state};
  }
  function readPending() {
    let value;
    try {value = storage.getItem(HUB_UPDATE_PENDING_KEY);}
    catch (_) {throw hubUpdateFail('storage', '无法读取更新交接状态；未执行新安装。');}
    if (!value) return null;
    if (value.length > 4096) throw hubUpdateFail('pending', '更新交接记录异常，请先手动检查当前 Hub。');
    let pending;
    try {pending = JSON.parse(value);} catch (_) {}
    if (!hubUpdatePendingValid(pending)) throw hubUpdateFail('pending', '更新交接记录异常，请先手动检查当前 Hub。');
    return pending;
  }
  function savePending(record) {
    const text = JSON.stringify(record);
    try {storage.setItem(HUB_UPDATE_PENDING_KEY, text); if (storage.getItem(HUB_UPDATE_PENDING_KEY) !== text) throw Error();}
    catch (_) {throw hubUpdateFail('storage', '无法保存更新交接状态；未安装更新。');}
  }
  function clearPending(record, required = false) {
    if (JSON.stringify(readPending()) !== JSON.stringify(record)) {
      if (required) throw hubUpdateFail('pending-changed', '更新交接记录发生变化，未确认本次更新完成。');
      return;
    }
    storage.removeItem(HUB_UPDATE_PENDING_KEY);
    if (storage.getItem(HUB_UPDATE_PENDING_KEY) !== null) throw hubUpdateFail('storage', '更新交接记录未能清除，请重新确认保存状态。');
  }
  async function getRelease(target, signal) {
    return hubUpdateDeadline(async stageSignal => {
      const bytes = await hubUpdatePublicBytes(request, HUB_UPDATE_REPOSITORY_API + '/releases/' + target.releaseId,
        {signal: stageSignal, limit: HUB_UPDATE_METADATA_LIMIT});
      return validateHubUpdateRelease(hubUpdateParseJSON(bytes), target);
    }, metadataTimeoutMs, signal);
  }
  async function download(asset, limit, timeout, signal, releaseId, base) {
    return hubUpdateDeadline(async stageSignal => {
      const bytes = await hubUpdatePublicBytes(request, asset.url, {signal: stageSignal, limit, size: asset.size, binary: true, relay: {base, releaseId, assetId: asset.id}});
      if (registryBaseURL(getRegistryBaseURL()) !== base) throw hubUpdateFail('cancelled', '下载服务已切换，请重新检查更新。');
      if (await hashHubUpdateBytes(bytes, crypto) !== asset.sha256) throw hubUpdateFail('hash', 'Release 附件 SHA-256 不匹配；拒绝更新。');
      stageSignal.throwIfAborted();
      return bytes;
    }, timeout, signal);
  }
  async function runUpdate(target, currentTask) {
    const signal = currentTask.controller.signal;
    if (!hubUpdateVersion(currentVersion) || !hubUpdateVersion(target?.version) || target.tag !== 'v' + target.version ||
        !hubUpdateId(target.releaseId) || compareSemVer(currentVersion, target.version) >= 0) throw hubUpdateFail('version', '请选择严格高于当前版本的三段式 Hub 版本。');
    if (readPending()) throw hubUpdateFail('pending', '上次更新仍待确认，请先重新确认保存状态。');
    const registryBase = registryBaseURL(getRegistryBaseURL());
    const snapshot = host.snapshot();
    // Feature checks and old-content digest happen before requesting any bytes.
    const previousContentSha256 = await hashHubUpdateBytes(new TextEncoder().encode(snapshot.content), crypto);
    signal.throwIfAborted();
    const release = await getRelease(target, signal);
    publish({status: 'downloading'});
    const metadataBytes = await download(release.metadata, HUB_UPDATE_METADATA_LIMIT, metadataTimeoutMs, signal, release.releaseId, registryBase);
    const metadata = validateHubUpdateMetadata(hubUpdateParseJSON(metadataBytes), release);
    const bytes = await download(release.asset, HUB_UPDATE_ASSET_LIMIT, assetTimeoutMs, signal, release.releaseId, registryBase);
    publish({status: 'verifying'});
    const script = await validateHubUpdatePackage(bytes, metadata, crypto);
    signal.throwIfAborted();
    const checked = await getRelease(target, signal);
    if (JSON.stringify(checked) !== JSON.stringify(release)) throw hubUpdateFail('release-changed', '下载期间 Release 或附件发生变化，请重新检查更新。');
    signal.throwIfAborted();
    if (typeof backup !== 'function') throw hubUpdateFail('backup', '无法准备旧 Hub 恢复文件；未安装更新。');
    await backup(snapshot.script, currentVersion);
    signal.throwIfAborted();
    publish({backupRequested: true});
    signal.throwIfAborted();
    const record = {schemaVersion: 1, scriptFieldsVersion: 1, scope: 'global', id: snapshot.id, previousVersion: currentVersion, version: target.version,
      releaseId: release.releaseId, assetId: release.asset.id, assetSha256: release.asset.sha256,
      contentSha256: metadata.contentSha256, previousContentSha256, createdAt: now()};
    currentTask.record = record;
    savePending(record);
    signal.throwIfAborted();
    publish({status: 'installing'});
    signal.throwIfAborted();
    if (registryBaseURL(getRegistryBaseURL()) !== registryBase) {clearPending(record); throw hubUpdateFail('cancelled', '下载服务已切换；未安装更新。');}
    currentTask.committing = true;
    try {host.install(snapshot, script.content);}
    catch (error) {
      // Only clear our handoff if the old content is positively still installed.
      // An exception after mutation is an uncertain commit, never a tree rollback.
      try {if (host.snapshot().content === snapshot.content) {clearPending(record); currentTask.committing = false;}} catch (_) {}
      throw error;
    }
    if (!disposed) reloadTimer = setTimeout(() => publish({status: 'unconfirmed',
      error: '脚本写入已提交，但未观察到新版启动。请保留恢复文件，在酒馆助手中检查脚本与保存状态。'}), confirmationTimeoutMs);
    return publish({status: 'awaiting-reload', error: ''});
  }
  function launch(action, initial) {
    if (disposed) return Promise.resolve({status: 'cancelled'});
    if (task) return task.promise;
    const currentTask = {controller: new AbortController(), committing: false}; task = currentTask;
    let rejectCancelled;
    const cancelled = new Promise((_, reject) => {rejectCancelled = reject;});
    currentTask.cancel = () => {currentTask.controller.abort(); rejectCancelled(hubUpdateFail('cancelled', '更新已取消。'));};
    currentTask.promise = Promise.race([Promise.resolve().then(() => action(currentTask)), cancelled])
      .catch(error => disposed ? {status: 'cancelled'} : publish({status: currentTask.committing ? 'unconfirmed' : 'failed',
        error: error?.hubSelfUpdateError || error?.code ? error.message : '更新失败；未确认安装成功，请保留恢复文件并重试。'}))
      .finally(() => {
        if (currentTask.record && !currentTask.committing) {try {clearPending(currentTask.record);} catch (_) {}}
        if (task === currentTask) task = null;
      });
    publish(initial);
    return currentTask.promise;
  }
  function start(target) {
    if (task) return task.promise;
    if (state.status === 'awaiting-reload' || state.status === 'unconfirmed') return Promise.resolve({...state});
    // Take a copy so UI/release-list mutations cannot change the chosen target.
    const locked = target && {releaseId: target.releaseId, version: target.version, tag: target.tag};
    return launch(t => runUpdate(locked, t), {status: 'preparing', targetVersion: locked?.version || null, error: '', backupRequested: false});
  }
  async function confirm(record, currentTask) {
    currentTask.committing = true;
    if (now() - record.createdAt > 24 * 60 * 60 * 1000 || record.createdAt > now() + 60000) throw hubUpdateFail('handoff-expired', '更新交接记录已过期，请手动核对当前脚本和恢复文件。');
    const snapshot = host.snapshot();
    const actualHash = await hashHubUpdateBytes(new TextEncoder().encode(snapshot.content), crypto);
    currentTask.controller.signal.throwIfAborted();
    if (snapshot.id === record.id && currentVersion === record.previousVersion && actualHash === record.previousContentSha256) {
      clearPending(record, true);
      return publish({status: 'failed', error: '上次更新未生效或已恢复原版本，可以重新检查更新。'});
    }
    if (record.version !== currentVersion) throw hubUpdateFail('handoff-version', '尚未载入目标 Hub 版本。请保留恢复文件，检查酒馆助手脚本及保存状态。');
    if (snapshot.id !== record.id || actualHash !== record.contentSha256) {
      throw hubUpdateFail('handoff-identity', '新 Hub 的实例或代码与更新目标不一致，未确认成功。');
    }
    if (typeof readSavedScript !== 'function') throw hubUpdateFail('persistence', '新版已加载，但当前宿主无法确认持久保存。');
    if (JSON.stringify(readPending()) !== JSON.stringify(record)) throw hubUpdateFail('pending-changed', '更新交接记录发生变化，未确认本次更新完成。');
    const expectedName = updatedScriptName(snapshot.script.name, record.version);
    // A published older updater wrote content only. Complete its validated,
    // hash-bound handoff once through the same guarded field writer; never sweep
    // arbitrary installed scripts or treat a new writer's missing name as success.
    if (record.scriptFieldsVersion === undefined && snapshot.script.name !== expectedName) {
      host.install(snapshot, snapshot.content);
    }
    if (host.snapshot().script.name !== expectedName) throw hubUpdateFail('persistence', '宿主名称版本尚未同步，未确认更新成功。');
    await hubUpdateDeadline(async signal => {
      for (;;) {
        signal.throwIfAborted();
        const saved = await readSavedScript(record.id, signal);
        const content = saved?.content;
        if (saved?.id === record.id && saved?.name === expectedName && typeof content === 'string' && await hashHubUpdateBytes(new TextEncoder().encode(content), crypto) === record.contentSha256) {
          signal.throwIfAborted();
          const latest = host.snapshot();
          if (latest.id !== record.id || latest.content !== snapshot.content || latest.script.name !== expectedName) throw hubUpdateFail('handoff-identity', '确认期间 Hub 脚本发生变化。');
          return;
        }
        await new Promise((resolve, reject) => {
          const onAbort = () => {clearTimeout(timer); reject(hubUpdateFail('cancelled', '保存确认已取消。'));};
          const timer = setTimeout(() => {signal.removeEventListener('abort', onAbort); resolve();}, confirmationIntervalMs);
          signal.addEventListener('abort', onAbort, {once: true});
        });
      }
    }, confirmationTimeoutMs, currentTask.controller.signal);
    currentTask.controller.signal.throwIfAborted();
    clearPending(record, true);
    return publish({status: 'completed', error: '', targetVersion: record.version});
  }
  function resume() {
    if (disposed) return Promise.resolve({status: 'cancelled'});
    if (task) return task.promise;
    let record;
    try {record = readPending();}
    catch (error) {return Promise.resolve(publish({status: 'unconfirmed', error: error.message}));}
    if (!record) return Promise.resolve({...state});
    return launch(t => confirm(record, t), {status: 'confirming', targetVersion: record.version, error: ''});
  }
  return {
    start, resume, getState: () => ({...state}), isBusy: () => hubUpdateBusyStates.has(state.status),
    subscribe(listener) {listeners.add(listener); try {listener({...state});} catch (_) {} return () => listeners.delete(listener);},
    dispose() {if (disposed) return; disposed = true; clearTimeout(reloadTimer); listeners.clear(); task?.cancel();},
  };
}
