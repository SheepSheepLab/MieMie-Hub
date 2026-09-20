import {compareSemVer} from './hub-update-check.js';
import {registryBaseURL} from './registry-client.js';

// Downloaded scripts are never evaluated by this module. Only the host starts
// a fully verified package after a synchronous, content-only tree mutation.
export const EXTENSION_PACKAGE_METADATA = 'MieMie-Extension-update.json';
export const EXTENSION_PACKAGE_IDENTITY_PREFIX = '// MieMie-Extension-Build: ';
export const EXTENSION_PACKAGE_LIMIT = 16 * 1024 * 1024;
const extensionMetadataLimit = 64 * 1024;
const extensionVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$(?![\s\S])/;
const extensionIdPattern = /^[a-z0-9][a-z0-9._-]{1,79}$(?![\s\S])/;
const extensionHashPattern = /^[a-f0-9]{64}$(?![\s\S])/;
const extensionLegacyPolisherHash = 'ec6266a8cb4038dadf20c357ef1acb9b7d8239036467c8d13e6ec98ed3a000f4';
const extensionLegacyPolisherRepository = 'https://github.com/SheepSheepLab/MieMie-Polisher';
const extensionLegacyPolisherScriptId = '4dd658f1-9d4b-4f74-bba8-305c4ef2a9c8';
function extensionPackageError(code, message) { return Object.assign(new Error(message), {code}); }
function extensionObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function extensionVersion(value) { return typeof value === 'string' && extensionVersionPattern.test(value); }
function extensionId(value) { return typeof value === 'string' && extensionIdPattern.test(value) && value !== 'miemie.hub'; }
function extensionKeys(value, keys) { return extensionObject(value) && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
function extensionClone(value) { try {return structuredClone(value);} catch {throw extensionPackageError('host-schema', '脚本树包含无法安全复制的数据。');} }
function extensionText(value, limit, required = true) {return typeof value === 'string' && (!required || !!value.trim()) && value.length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);}

export function parseExtensionRepository(input) {
  let url;
  try { url = new URL(input); } catch {throw extensionPackageError('repository', '请输入作者自己的公开 GitHub Repository URL。');}
  const match = /^\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100})\/?$/.exec(url.pathname);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash || !match || match[2] === '.' || match[2] === '..') {
    throw extensionPackageError('repository', '仅支持 https://github.com/作者/仓库 格式，不接受代理或任意下载地址。');
  }
  const owner = match[1], repo = match[2].replace(/\.git$/, '');
  if (!repo || repo === '.' || repo === '..') throw extensionPackageError('repository', 'GitHub 仓库名称无效。');
  return {owner, repo, url: 'https://github.com/' + owner + '/' + repo, api: 'https://api.github.com/repos/' + owner + '/' + repo};
}

export function validateExtensionManifest(manifest, repository) {
  if (!extensionObject(manifest) || manifest.schemaVersion !== 1 || manifest.apiVersion !== 1 || !extensionId(manifest.id)
      || !extensionVersion(manifest.version) || !extensionText(manifest.name, 80) || !extensionText(manifest.author, 100)
      || !extensionText(manifest.description, 2000, false) || !extensionText(manifest.entry, 200)
      || !extensionText(manifest.license, 100)) throw extensionPackageError('manifest', 'Extension Manifest 不完整或不兼容 Extension API v1。');
  const repo = parseExtensionRepository(manifest.repository);
  if (repository && repo.url.toLowerCase() !== parseExtensionRepository(repository).url.toLowerCase()) throw extensionPackageError('manifest', 'Manifest Repository 与下载仓库不一致。');
  if (manifest.hubApi !== undefined && (!extensionObject(manifest.hubApi) || !Number.isInteger(manifest.hubApi.min) || !Number.isInteger(manifest.hubApi.max)
      || manifest.hubApi.min > 1 || manifest.hubApi.max < 1 || manifest.hubApi.min < 1)) throw extensionPackageError('manifest', '扩展不支持当前 Hub API。');
  if (manifest.contributes !== undefined && !extensionObject(manifest.contributes)) throw extensionPackageError('manifest', 'contributes 格式无效。');
  // Match existing Runtime v1 structural limits without requiring a Launcher or
  // open(). Runtime still owns launcher execution diagnostics independently.
  if (manifest.contributes?.launcher !== undefined) {
    const launcher = manifest.contributes.launcher;
    if (!extensionObject(launcher) || !extensionText(launcher.title, 60) || (launcher.icon !== undefined && (typeof launcher.icon !== 'string' || launcher.icon.length > 16))) {
      throw extensionPackageError('manifest', 'Launcher 声明不符合 Extension API v1 的标题／短文本图标限制。');
    }
  }
  if (manifest.icon !== undefined) {
    if (!extensionText(manifest.icon, 2048) || manifest.icon.startsWith('//') || /[\\\u0000-\u0020]/.test(manifest.icon)) throw extensionPackageError('manifest', 'Icon 地址无效。');
    if (/^[a-z][a-z0-9+.-]*:/i.test(manifest.icon)) {
      let icon; try {icon = new URL(manifest.icon);} catch {}
      if (!icon || icon.protocol !== 'https:' || icon.username || icon.password || icon.port) throw extensionPackageError('manifest', '远程 Icon 必须使用 HTTPS。');
    } else if (manifest.icon.startsWith('/') || manifest.icon.split('/').includes('..')) throw extensionPackageError('manifest', 'Icon 相对路径无效。');
  }
  return extensionClone(manifest);
}

export function parseExtensionBuildIdentity(content) {
  if (typeof content !== 'string') return null;
  const newline = content.indexOf('\n');
  if (newline < 0 || newline > 2048 || !content.startsWith(EXTENSION_PACKAGE_IDENTITY_PREFIX)) return null;
  let identity;
  try {identity = JSON.parse(content.slice(EXTENSION_PACKAGE_IDENTITY_PREFIX.length, newline));} catch {return null;}
  if (!extensionKeys(identity, ['schemaVersion', 'productId', 'version', 'scriptId', 'repository']) || identity.schemaVersion !== 1
      || !extensionId(identity.productId) || !extensionVersion(identity.version) || !extensionText(identity.scriptId, 200)
      || identity.scriptId === 'e85cd9a3-6352-4b23-938a-6c94d826b4d3' || !content.slice(newline + 1).trim()) return null;
  try {parseExtensionRepository(identity.repository);} catch {return null;}
  return identity;
}

async function extensionHash(bytes, crypto) {
  if (!crypto?.subtle?.digest) throw extensionPackageError('crypto', '当前浏览器不支持 SHA-256；请使用 HTTPS 或 localhost。');
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function extensionJSON(bytes) {
  try {return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));} catch {throw extensionPackageError('json', '下载文件不是有效的 UTF-8 JSON。');}
}
function extensionValidateScript(script) {
  const fail = () => {throw extensionPackageError('host-schema', '宿主脚本结构包含未知字段或不受支持的数据；未执行写入。');};
  if (!extensionKeys(script, ['type', 'enabled', 'name', 'id', 'content', 'info', 'button', 'data', 'export_with']) || script.type !== 'script'
      || typeof script.enabled !== 'boolean' || !extensionText(script.id, 200) || typeof script.name !== 'string'
      || typeof script.content !== 'string' || typeof script.info !== 'string' || !extensionObject(script.data)
      || !extensionKeys(script.button, ['enabled', 'buttons']) || typeof script.button.enabled !== 'boolean' || !Array.isArray(script.button.buttons)
      || !extensionKeys(script.export_with, ['data', 'button']) || typeof script.export_with.data !== 'boolean' || typeof script.export_with.button !== 'boolean') fail();
  for (const button of script.button.buttons) if (!extensionKeys(button, ['name', 'visible']) || typeof button.name !== 'string' || typeof button.visible !== 'boolean') fail();
}
function extensionValidateTree(trees) {
  if (!Array.isArray(trees)) throw extensionPackageError('host-schema', '全局脚本树格式无效。');
  const entries = [], ids = new Set();
  const addId = id => {if (!extensionText(id, 200) || ids.has(id)) throw extensionPackageError('host-ambiguous', '脚本树 ID 重复或无效，已拒绝修改。'); ids.add(id);};
  const addScript = (script, parent, index, folderEnabled = true) => {extensionValidateScript(script); addId(script.id); entries.push({script, parent, index, folderEnabled});};
  trees.forEach((tree, index) => {
    if (tree?.type === 'script') addScript(tree, trees, index);
    else if (tree?.type === 'folder' && extensionKeys(tree, ['type', 'enabled', 'name', 'id', 'icon', 'color', 'scripts']) && typeof tree.enabled === 'boolean'
      && typeof tree.name === 'string' && typeof tree.icon === 'string' && typeof tree.color === 'string' && Array.isArray(tree.scripts)) {
      addId(tree.id); tree.scripts.forEach((script, childIndex) => addScript(script, tree.scripts, childIndex, tree.enabled));
    } else throw extensionPackageError('host-schema', '脚本树包含不支持的字段或嵌套文件夹，未执行写入。');
  });
  return entries;
}

export function validateExtensionPackageMetadata(metadata, repository, release) {
  if (!extensionKeys(metadata, ['schemaVersion', 'format', 'productId', 'version', 'tag', 'scriptId', 'manifest', 'asset', 'contentSha256'])
      || metadata.schemaVersion !== 1 || metadata.format !== 'tavern-helper-script' || !extensionId(metadata.productId)
      || !extensionVersion(metadata.version) || metadata.tag !== 'v' + metadata.version || !extensionText(metadata.scriptId, 200)
      || metadata.scriptId === 'e85cd9a3-6352-4b23-938a-6c94d826b4d3' || !extensionKeys(metadata.asset, ['name', 'size', 'sha256'])
      || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}\.json$(?![\s\S])/.test(metadata.asset.name || '') || metadata.asset.name === EXTENSION_PACKAGE_METADATA
      || !Number.isSafeInteger(metadata.asset.size) || metadata.asset.size < 1 || metadata.asset.size > EXTENSION_PACKAGE_LIMIT
      || !extensionHashPattern.test(metadata.asset.sha256 || '') || !extensionHashPattern.test(metadata.contentSha256 || '')) throw extensionPackageError('metadata', '扩展包机器元数据无效。');
  const manifest = validateExtensionManifest(metadata.manifest, repository);
  if (manifest.id !== metadata.productId || manifest.version !== metadata.version || (release && (release.tag_name !== metadata.tag || release.draft !== false))) throw extensionPackageError('metadata', 'Manifest、Release 与包身份或版本不一致。');
  return extensionClone(metadata);
}

export async function validateExtensionPackage(bytes, metadata, crypto = globalThis.crypto) {
  if (!bytes?.byteLength || bytes.byteLength > EXTENSION_PACKAGE_LIMIT || bytes.byteLength !== metadata.asset.size || await extensionHash(bytes, crypto) !== metadata.asset.sha256) throw extensionPackageError('hash', 'Extension 文件大小或 SHA-256 不匹配。');
  const script = extensionJSON(bytes); extensionValidateScript(script);
  const identity = parseExtensionBuildIdentity(script.content);
  if (!identity || script.id !== metadata.scriptId || identity.scriptId !== metadata.scriptId || identity.productId !== metadata.productId
      || identity.version !== metadata.version || parseExtensionRepository(identity.repository).url.toLowerCase() !== parseExtensionRepository(metadata.manifest.repository).url.toLowerCase()) throw extensionPackageError('identity', 'Extension 包身份、Repository 或版本与 Manifest 不一致。');
  if (await extensionHash(new TextEncoder().encode(script.content), crypto) !== metadata.contentSha256) throw extensionPackageError('content-hash', 'Extension content SHA-256 不匹配。');
  // New installation has no right to import another user's data/settings.
  if (Reflect.ownKeys(script.data).length !== 0) throw extensionPackageError('package-data', '公开安装包必须使用空 data，不能携带用户数据。');
  return script;
}

export function createExtensionPackageManager({getScriptTrees, updateScriptTreesWith, fetch: request = (...args) => globalThis.fetch(...args),
  crypto = globalThis.crypto, randomUUID = () => crypto.randomUUID(), onChange = () => {}, backup, confirmUninstall, getRegistryBaseURL = () => '', now = Date.now, downloadCacheTtlMs = 120000, metadataTimeoutMs = 15000, assetTimeoutMs = 60000} = {}) {
  let disposed = false, busy = false;
  const controllers = new Set(), legacyContents = new Set(), listeners = new Set();
  const downloaded = new Map(); let cacheBytes = 0, relayCooldown = null;
  function pruneDownloads() {for (const [key, entry] of downloaded) if (entry.until <= now()) {cacheBytes -= entry.bytes.byteLength; downloaded.delete(key);}}
  const notify = () => {try {onChange();} catch {} for (const listener of listeners) {try {listener();} catch {}}};
  function alive() {if (disposed) throw extensionPackageError('disposed', '扩展安装任务已取消。');}
  function readTree() {
    alive(); if (typeof getScriptTrees !== 'function') throw extensionPackageError('host-unavailable', '当前宿主未提供全局脚本 API。');
    const trees = getScriptTrees({type: 'global'});
    if (trees?.then) {Promise.resolve(trees).catch(() => {}); throw extensionPackageError('host-async', '不支持异步脚本树宿主。');}
    extensionValidateTree(trees); return trees;
  }
  function identity(script) {
    const marker = parseExtensionBuildIdentity(script.content);
    if (marker) return marker;
    if (legacyContents.has(script.content)) return {schemaVersion: 1, productId: 'miemie.polisher', version: '1.0.1', scriptId: extensionLegacyPolisherScriptId, repository: extensionLegacyPolisherRepository, legacy: true};
    return null;
  }
  async function learnLegacy(trees) {
    for (const {script} of extensionValidateTree(trees)) {
      if (script.content.startsWith('// MieMie Polisher · 咩咩润色工具 Extension 1.0.1\n') && !legacyContents.has(script.content)
          && await extensionHash(new TextEncoder().encode(script.content), crypto) === extensionLegacyPolisherHash) legacyContents.add(script.content);
    }
  }
  function locate(trees, id) {
    const matches = extensionValidateTree(trees).filter(entry => identity(entry.script)?.productId === id);
    if (matches.length !== 1) throw extensionPackageError(matches.length ? 'duplicate' : 'not-global', matches.length ? '存在多个相同 Extension ID 的全局脚本，已拒绝修改。' : '未唯一找到可验证的全局 Extension 脚本；角色或预设脚本不支持自动管理。');
    return matches[0];
  }
  function writeTree(action) {
    alive(); if (typeof updateScriptTreesWith !== 'function') throw extensionPackageError('host-unavailable', '当前宿主未提供正式脚本写入 API。');
    let open = true, called = 0, result;
    try {result = updateScriptTreesWith(trees => {alive(); if (!open || ++called !== 1) throw extensionPackageError('host-async', '宿主未同步执行唯一一次写入。'); extensionValidateTree(trees); return action(trees);}, {type: 'global'});}
    finally {open = false;}
    if (result?.then) {Promise.resolve(result).catch(() => {}); throw extensionPackageError('host-async', '写入结果异步，持久保存状态尚未确认。');}
    if (called !== 1) throw extensionPackageError('host-write', '宿主未执行写入。');
    extensionValidateTree(result); return result;
  }
  async function deadline(action, milliseconds, outerSignal) {
    alive(); outerSignal?.throwIfAborted();
    const controller = new AbortController(); controllers.add(controller);
    let rejectCancelled;
    const cancelled = new Promise((_, reject) => {rejectCancelled = reject;});
    const abort = () => rejectCancelled(extensionPackageError('cancelled', '扩展操作已取消。'));
    controller.signal.addEventListener('abort', abort, {once: true});
    const propagate = () => controller.abort(); outerSignal?.addEventListener('abort', propagate, {once: true});
    const timer = setTimeout(() => {rejectCancelled(extensionPackageError('timeout', 'GitHub 请求超时，未完成安装。')); controller.abort();}, milliseconds);
    try {return await Promise.race([Promise.resolve().then(() => action(controller.signal)), cancelled]);}
    finally {clearTimeout(timer); outerSignal?.removeEventListener('abort', propagate); controllers.delete(controller);}
  }
  async function publicBytes(url, {limit, size, binary = false, signal, relayContext}) {
    let response, relayBase = '', relayURL = '';
    try {response = await request(url, {method: 'GET', headers: {Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json'}, mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: binary ? 'follow' : 'error', cache: 'no-store', signal});}
    catch {
      signal.throwIfAborted();
      if (!binary || !relayContext) throw extensionPackageError('download', '无法读取作者 GitHub Release 信息，请检查网络后重试；未安装扩展。');
      // GitHub's final Release CDN may omit CORS headers. The configured Registry
      // can transport only Manifest-verified assets, not arbitrary URLs. Never
      // send Tavern cookies, Registry sessions or GitHub credentials to it.
      relayBase = registryBaseURL(getRegistryBaseURL());
      if (!relayBase) throw extensionPackageError('download', '作者 GitHub 附件被浏览器跨域限制拦截，安全下载服务暂不可用，请稍后重试；未安装扩展。');
      if (relayCooldown?.base === relayBase && relayCooldown.until > now()) throw extensionPackageError('github_rate_limited', 'GitHub 匿名访问额度暂时用完，请在 ' + new Date(relayCooldown.until).toLocaleTimeString() + ' 后重试；本地扩展未被修改。');
      relayURL = relayBase + '/api/packages/github/asset';
      try {response = await request(relayURL, {method: 'POST', headers: {Accept: 'application/octet-stream', 'Content-Type': 'application/json'},
        body: JSON.stringify(relayContext), mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store', signal});}
      catch {signal.throwIfAborted(); throw extensionPackageError('relay', '安全下载服务暂时无法连接，请稍后重试；未安装扩展。');}
      if (registryBaseURL(getRegistryBaseURL()) !== relayBase) throw extensionPackageError('cancelled', '下载服务已切换，请重新预览项目。');
    }
    if (relayBase && (response?.url !== relayURL || response.redirected)) throw extensionPackageError('redirect', '安全下载响应地址发生变化，已拒绝安装。');
    if (relayBase && !response?.ok && !['opaque', 'opaqueredirect'].includes(response?.type)) {
      // Only consume a bounded structured error. Never show arbitrary upstream
      // HTML/body text (which may contain IPs or internal service details).
      let errorData;
      if (response?.body?.getReader) {
        const reader = response.body.getReader(), parts = []; let length = 0;
        const cancel = () => {void reader.cancel().catch(() => {});}; signal.addEventListener('abort', cancel, {once: true});
        try {for (;;) {signal.throwIfAborted(); const {done, value} = await reader.read(); if (done) break; length += value.byteLength; if (length > 16384) break; parts.push(value);}
          if (length <= 16384) {const bytes = new Uint8Array(length); let offset = 0; for (const part of parts) {bytes.set(part, offset); offset += part.length;} try {errorData = extensionJSON(bytes)?.error;} catch {}}
        } finally {signal.removeEventListener('abort', cancel); cancel();}
      }
      signal.throwIfAborted();
      if (errorData?.code === 'github_rate_limited') {
        const at = Date.parse(errorData.retryAt);
        const retryAt = Number.isFinite(at) && at > now() && at <= now() + 86400000 ? at : now() + 60000;
        relayCooldown = {base: relayBase, until: retryAt};
        throw extensionPackageError('github_rate_limited', 'GitHub 匿名访问额度暂时用完，请在 ' + new Date(retryAt).toLocaleTimeString() + ' 后重试；本地扩展未被修改。');
      }
      const messages = {github_unavailable: '安全下载服务暂时无法连接作者 GitHub，请稍后重试', upstream_timeout: '读取作者 GitHub 文件超时，请稍后重试', relay_busy: '安全下载任务繁忙，请稍后重试', rate_limited: '请求过于频繁，请稍后重试', origin_denied: '安全下载服务暂不支持当前酒馆地址，请联系服务维护者', release_changed: '作者 Release 已发生变化，请重新预览'};
      if (Object.hasOwn(messages, errorData?.code || '')) throw extensionPackageError(errorData.code, messages[errorData.code] + '；未安装扩展。');
    }
    if (!response?.ok || ['opaque', 'opaqueredirect'].includes(response.type)) throw extensionPackageError(relayBase ? 'relay' : 'http',
      (relayBase ? '安全下载服务暂不可用，请稍后重试' : 'GitHub 请求失败') + (response?.status ? '（HTTP ' + response.status + '）' : '') + '；未安装扩展。');
    if (relayBase) {
      if (response.url !== relayURL || response.redirected) throw extensionPackageError('redirect', '安全下载响应地址发生变化，已拒绝安装。');
    } else if (binary) {
      let final; try {final = new URL(response.url);} catch {}
      if (!final || final.protocol !== 'https:' || final.username || final.password || final.port || !['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(final.hostname)) throw extensionPackageError('redirect', '附件跳转到不受支持的地址。');
    }
    const length = response.headers?.get('content-length');
    if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw extensionPackageError('size', 'GitHub 响应超过大小限制。');
    if (!response.body?.getReader) throw extensionPackageError('stream', '浏览器不支持受限流式下载。');
    const reader = response.body.getReader(), chunks = []; let total = 0;
    const cancel = () => {void reader.cancel().catch(() => {});}; signal.addEventListener('abort', cancel, {once: true});
    try {for (;;) {signal.throwIfAborted(); const {done, value} = await reader.read(); signal.throwIfAborted(); if (done) break;
      total += value.byteLength; if (total > limit || (size !== undefined && total > size)) throw extensionPackageError('size', '附件超过允许大小。'); chunks.push(value);}}
    finally {signal.removeEventListener('abort', cancel); void reader.cancel().catch(() => {});}
    if (relayBase && registryBaseURL(getRegistryBaseURL()) !== relayBase) throw extensionPackageError('cancelled', '下载服务已切换，请重新预览项目。');
    if (!total || (size !== undefined && total !== size)) throw extensionPackageError('size', '附件大小与 Release 不一致。');
    const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;} return bytes;
  }
  async function query(url, signal, limit = 1024 * 1024) {return deadline(async signal => extensionJSON(await publicBytes(url, {signal, limit})), metadataTimeoutMs, signal);}
  function asset(release, name, repo, limit) {
    const found = release.assets?.filter(item => item?.name === name);
    if (!found || found.length !== 1) throw extensionPackageError('asset', 'Release 缺少唯一的 ' + name + '。');
    const item = found[0];
    if (!Number.isSafeInteger(item.id) || item.id <= 0 || item.state !== 'uploaded' || !Number.isSafeInteger(item.size) || item.size < 1 || item.size > limit
      || !/^sha256:[a-f0-9]{64}$(?![\s\S])/.test(item.digest || '') || item.url !== repo.api + '/releases/assets/' + item.id
      || item.browser_download_url !== repo.url + '/releases/download/' + release.tag_name + '/' + name) throw extensionPackageError('asset', 'Release Asset ID、地址、大小或 digest 无效。');
    return {id: item.id, name, size: item.size, sha256: item.digest.slice(7), url: item.url, repository: repo.url, releaseId: release.id};
  }
  async function download(item, limit, signal) {return deadline(async signal => {
    // Short-lived iframe memory only, keyed by the full authoritative asset lock.
    // Every install still re-reads Release before/after verification. A cache hit
    // never bypasses digest, package/content hash, identity or write-time checks.
    pruneDownloads(); const key = JSON.stringify(item), cached = downloaded.get(key);
    const bytes = cached ? cached.bytes.slice() : await publicBytes(item.url, {signal, limit, size: item.size, binary: true,
      relayContext: {repository: item.repository, releaseId: item.releaseId, assetId: item.id}});
    if (bytes.byteLength !== item.size || bytes.byteLength > limit || await extensionHash(bytes, crypto) !== item.sha256) throw extensionPackageError('hash', 'GitHub Asset digest 校验失败。');
    signal.throwIfAborted(); alive();
    if (!cached && downloadCacheTtlMs > 0) {
      while (downloaded.size && (downloaded.size >= 8 || cacheBytes + bytes.byteLength > 32 * 1024 * 1024)) {
        const oldest = downloaded.keys().next().value; cacheBytes -= downloaded.get(oldest).bytes.byteLength; downloaded.delete(oldest);
      }
      downloaded.set(key, {bytes: bytes.slice(), until: now() + Math.min(downloadCacheTtlMs, 120000)}); cacheBytes += bytes.byteLength;
    }
    return bytes;
  }, limit === extensionMetadataLimit ? metadataTimeoutMs : assetTimeoutMs, signal);}
  async function releaseById(repo, id, signal) {
    if (!Number.isSafeInteger(id) || id < 1) throw extensionPackageError('release', 'Release ID 无效。');
    const release = await query(repo.api + '/releases/' + id, signal);
    if (!extensionObject(release) || release.id !== id || release.draft !== false || !Array.isArray(release.assets) || !extensionVersion(release.tag_name?.slice(1)) || release.tag_name !== 'v' + release.tag_name.slice(1)) throw extensionPackageError('release', 'Release 身份或三段式版本无效。');
    return release;
  }
  async function describe(repo, release, signal) {
    if (!release.assets.some(item => item?.name === EXTENSION_PACKAGE_METADATA)) return {repoUrl: repo.url, installable: false, compatibility: 'external', releaseId: release.id, version: release.tag_name.slice(1), tag: release.tag_name, reason: '作者尚未提供标准安装包，请前往 GitHub 获取。'};
    const metadataAsset = asset(release, EXTENSION_PACKAGE_METADATA, repo, extensionMetadataLimit);
    const metadata = validateExtensionPackageMetadata(extensionJSON(await download(metadataAsset, extensionMetadataLimit, signal)), repo.url, release);
    const packageAsset = asset(release, metadata.asset.name, repo, EXTENSION_PACKAGE_LIMIT);
    if (packageAsset.size !== metadata.asset.size || packageAsset.sha256 !== metadata.asset.sha256) throw extensionPackageError('metadata', '机器元数据与 GitHub Asset digest 不一致。');
    return {repoUrl: repo.url, installable: true, compatibility: 'installable', id: metadata.productId, version: metadata.version, tag: metadata.tag, releaseId: release.id, manifest: metadata.manifest, metadata, asset: packageAsset, metadataAsset};
  }
  async function inspect(repoUrl) {
    alive(); let repo = parseExtensionRepository(repoUrl);
    const info = await query(repo.api);
    if (!extensionObject(info) || info.private !== false || info.full_name?.toLowerCase() !== (repo.owner + '/' + repo.repo).toLowerCase()) throw extensionPackageError('repository', '仓库不存在、不是公开仓库或已重命名；请确认作者地址。');
    // GitHub URLs are case-insensitive, but returned Asset URLs use canonical case.
    repo = parseExtensionRepository('https://github.com/' + info.full_name);
    let highest = null;
    for (let page = 1; page <= 10; page++) {
      const releases = await query(repo.api + '/releases?per_page=100&page=' + page);
      if (!Array.isArray(releases)) throw extensionPackageError('release', 'GitHub Release 列表格式异常。');
      for (const release of releases) if (extensionObject(release) && release.draft === false && Number.isSafeInteger(release.id) && release.id > 0 && Array.isArray(release.assets)
        && typeof release.tag_name === 'string' && release.tag_name.startsWith('v') && extensionVersion(release.tag_name.slice(1))
        && (!highest || compareSemVer(release.tag_name.slice(1), highest.tag_name.slice(1)) > 0)) highest = release;
      if (releases.length < 100) break;
      if (page === 10) throw extensionPackageError('release-limit', 'Release 数量超过第一版扫描限制，未猜测最新版本。');
    }
    if (!highest) return {repoUrl: repo.url, installable: false, compatibility: 'external', reason: '没有有效三段式 Release，请前往 GitHub。'};
    return describe(repo, await releaseById(repo, highest.id), undefined);
  }
  function row(entry) {const value = identity(entry.script); return {id: value.productId, instanceId: entry.script.id, version: value.version, name: entry.script.name, enabled: entry.script.enabled, folderEnabled: entry.folderEnabled, repoUrl: value.repository, managed: true, legacy: !!value.legacy, scope: 'global'};}
  async function listInstalled() {const trees = readTree(); await learnLegacy(trees); alive(); return extensionValidateTree(trees).filter(entry => identity(entry.script)).map(row);}
  async function snapshot(id) {const trees = readTree(); await learnLegacy(trees); alive(); const entry = locate(trees, id); return {...row(entry), content: entry.script.content, script: extensionClone(entry.script)};}
  function ensureSnapshot(trees, saved) {const entry = locate(trees, saved.id); if (entry.script.id !== saved.instanceId || entry.script.content !== saved.content) throw extensionPackageError('changed', '安装实例或内容已被其他操作修改，请重新检查。'); return entry;}
  async function exclusive(action) {alive(); if (busy) throw extensionPackageError('busy', '已有扩展安装或管理操作正在进行。'); busy = true; notify(); try {return await action();} finally {busy = false; notify();}}
  async function lockedCandidate(candidate) {
    if (!candidate?.installable || !candidate.manifest || candidate.id !== candidate.manifest.id || candidate.version !== candidate.manifest.version || candidate.tag !== 'v' + candidate.version) throw extensionPackageError('candidate', '请先检查一个可安装的标准 GitHub Extension。');
    const repo = parseExtensionRepository(candidate.repoUrl), release = await releaseById(repo, candidate.releaseId);
    const fresh = await describe(repo, release);
    if (!fresh.installable || fresh.id !== candidate.id || fresh.version !== candidate.version || fresh.tag !== candidate.tag
      || JSON.stringify(fresh.asset) !== JSON.stringify(candidate.asset) || JSON.stringify(fresh.metadataAsset) !== JSON.stringify(candidate.metadataAsset)
      || JSON.stringify(fresh.metadata) !== JSON.stringify(candidate.metadata)) throw extensionPackageError('release-changed', '目标 Release 或 Asset 已变化，请重新检查。');
    const bytes = await download(fresh.asset, EXTENSION_PACKAGE_LIMIT);
    const script = await validateExtensionPackage(bytes, fresh.metadata, crypto); alive();
    const finalRelease = await releaseById(repo, fresh.releaseId);
    if (finalRelease.tag_name !== fresh.tag || JSON.stringify(asset(finalRelease, fresh.asset.name, repo, EXTENSION_PACKAGE_LIMIT)) !== JSON.stringify(fresh.asset)
      || JSON.stringify(asset(finalRelease, EXTENSION_PACKAGE_METADATA, repo, extensionMetadataLimit)) !== JSON.stringify(fresh.metadataAsset)) throw extensionPackageError('release-changed', '写入前 Release 附件已改变，已取消。');
    alive(); return {fresh, script};
  }
  async function check(id) {const installed = await snapshot(id), candidate = await inspect(installed.repoUrl);
    if (candidate.installable && candidate.id !== id) throw extensionPackageError('identity', '仓库当前包属于不同 Extension ID，不允许覆盖。');
    return {...candidate, currentVersion: installed.version, available: !!candidate.installable && compareSemVer(candidate.version, installed.version) > 0};}
  return {
    listInstalled, inspect, check,
    isBusy: () => busy,
    subscribe(listener) {listeners.add(listener); return () => listeners.delete(listener);},
    install(candidate) {return exclusive(async () => {
      const before = readTree(); await learnLegacy(before);
      if (extensionValidateTree(before).some(entry => identity(entry.script)?.productId === candidate?.id)) throw extensionPackageError('duplicate', '此 Extension 已安装，请使用更新。');
      const {script, fresh} = await lockedCandidate(candidate);
      const newScript = extensionClone(script); newScript.id = randomUUID(); newScript.enabled = true;
      if (!extensionText(newScript.id, 200) || newScript.id === script.id) throw extensionPackageError('instance-id', '无法生成独立安装实例 ID。');
      const result = writeTree(trees => {
        if (extensionValidateTree(trees).some(entry => identity(entry.script)?.productId === fresh.id || entry.script.id === newScript.id
          || (fresh.id === 'miemie.polisher' && entry.script.content.startsWith('// MieMie Polisher ·')))) throw extensionPackageError('duplicate', '检测到已有同 ID 扩展或旧版候选，拒绝重复安装。');
        trees.push(newScript); extensionValidateTree(trees); return trees;
      });
      const installed = locate(result, fresh.id); if (installed.script.id !== newScript.id || installed.script.content !== script.content) throw extensionPackageError('host-write', '宿主返回安装状态异常，请检查脚本管理。');
      return {ok: true, ...row(installed), action: 'installed', persistence: 'unconfirmed'};
    });},
    update(id, candidate) {return exclusive(async () => {
      const saved = await snapshot(id); candidate ||= await inspect(saved.repoUrl);
      if (!candidate?.installable || candidate.id !== id || parseExtensionRepository(candidate.repoUrl).url.toLowerCase() !== parseExtensionRepository(saved.repoUrl).url.toLowerCase()
        || compareSemVer(candidate.version, saved.version) <= 0) throw extensionPackageError('version', '没有来自原作者仓库的更高版本同 ID Extension。');
      const {script, fresh} = await lockedCandidate(candidate);
      const oldIdentity = identity({content: saved.content});
      if (fresh.metadata.scriptId !== oldIdentity.scriptId) throw extensionPackageError('identity', '发布包固定 scriptId 已变化，拒绝跨包覆盖。');
      if (typeof backup !== 'function') throw extensionPackageError('backup-required', '更新前需要导出旧版恢复文件；未覆盖当前扩展。');
      await backup(extensionClone(saved.script), {id, version: saved.version, reason: 'update'});
      alive();
      const result = writeTree(trees => {const entry = ensureSnapshot(trees, saved); entry.script.content = script.content; return trees;});
      const installed = locate(result, id); if (installed.script.content !== script.content) throw extensionPackageError('host-write', '宿主未返回目标内容，保存状态待确认。');
      return {ok: true, ...row(installed), action: 'updated', persistence: 'unconfirmed'};
    });},
    setEnabled(id, enabled) {return exclusive(async () => {
      if (typeof enabled !== 'boolean') throw extensionPackageError('enabled', '启用状态必须是布尔值。'); const saved = await snapshot(id);
      const result = writeTree(trees => {const entry = ensureSnapshot(trees, saved); if (enabled && !entry.folderEnabled) throw extensionPackageError('folder-disabled', '请先在酒馆助手启用该文件夹。'); entry.script.enabled = enabled; return trees;});
      const installed = locate(result, id); if (installed.script.enabled !== enabled) throw extensionPackageError('host-write', '宿主启用状态未确认。');
      return {ok: true, ...row(installed), action: enabled ? 'enabled' : 'disabled', persistence: 'unconfirmed'};
    });},
    uninstall(id) {return exclusive(async () => {const saved = await snapshot(id);
      if (typeof confirmUninstall === 'function' && await confirmUninstall(extensionClone(saved.script)) === false) throw extensionPackageError('cancelled', '已取消卸载，脚本保留。');
      alive();
      const result = writeTree(trees => {const entry = ensureSnapshot(trees, saved);
        if (JSON.stringify(entry.script) !== JSON.stringify(saved.script)) throw extensionPackageError('changed', '确认期间脚本 data 或其他字段已变化，请重新确认卸载。');
        entry.parent.splice(entry.index, 1); return trees;});
      if (extensionValidateTree(result).some(entry => entry.script.id === saved.instanceId)) throw extensionPackageError('host-write', '宿主未删除目标条目。');
      return {ok: true, id, instanceId: saved.instanceId, action: 'uninstalled', physical: true, persistence: 'unconfirmed'};
    });},
    dispose() {disposed = true; for (const controller of controllers) controller.abort(); controllers.clear(); listeners.clear(); downloaded.clear(); cacheBytes = 0; relayCooldown = null;},
  };
}
