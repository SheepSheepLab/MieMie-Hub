// Only the audited Tavern Helper script-tree shape is writable. Its schema
// strips unknown fields, so silently passing an unfamiliar shape is unsafe.
const hubHostPackageId = 'e85cd9a3-6352-4b23-938a-6c94d826b4d3';
const hubHostIdentityPrefix = '// MieMie-Hub-Build: ';
const hubHostVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$(?![\s\S])/;

function hubHostError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function hubHostObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.prototype.toString.call(value) === '[object Object]';
}

function hubHostKeys(value, expected) {
  return hubHostObject(value) && Reflect.ownKeys(value).length === expected.length
    && expected.every(key => Object.prototype.hasOwnProperty.call(value, key));
}

export function parseHubBuildIdentity(content) {
  if (typeof content !== 'string') return null;
  const newline = content.indexOf('\n');
  if (newline < 0 || newline > 1024) return null;
  const firstLine = content.slice(0, newline);
  if (!firstLine.startsWith(hubHostIdentityPrefix)) return null;
  let identity;
  try { identity = JSON.parse(firstLine.slice(hubHostIdentityPrefix.length)); }
  catch { return null; }
  if (!hubHostKeys(identity, ['schemaVersion', 'productId', 'version', 'scriptId'])
    || identity.schemaVersion !== 1 || identity.productId !== 'miemie.hub'
    || identity.scriptId !== hubHostPackageId || typeof identity.version !== 'string'
    || !hubHostVersionPattern.test(identity.version) || !content.slice(newline + 1).trim()) return null;
  return {schemaVersion: 1, productId: identity.productId, version: identity.version, scriptId: identity.scriptId};
}

function hubHostClone(value) {
  try { return structuredClone(value); }
  catch { throw hubHostError('HOST_SCHEMA', '脚本树包含无法安全复制的数据，已拒绝自动更新。'); }
}

function hubHostValidateTree(trees) {
  const scripts = [];
  const ids = new Set();
  const invalid = () => { throw hubHostError('HOST_SCHEMA', '当前脚本树包含未知字段或不支持的结构，已拒绝自动更新以保留其他脚本和用户数据。'); };
  const registerId = value => {
    if (typeof value !== 'string' || !value.trim()) invalid();
    if (ids.has(value)) throw hubHostError('HOST_AMBIGUOUS', '脚本树存在重复 ID，无法唯一确认当前 Hub，已拒绝自动更新。');
    ids.add(value);
  };
  const validateScript = script => {
    if (!hubHostKeys(script, ['type', 'enabled', 'name', 'id', 'content', 'info', 'button', 'data', 'export_with'])
      || script.type !== 'script' || typeof script.enabled !== 'boolean'
      || typeof script.name !== 'string' || typeof script.content !== 'string' || typeof script.info !== 'string'
      || !hubHostObject(script.data)
      || !hubHostKeys(script.button, ['enabled', 'buttons']) || typeof script.button.enabled !== 'boolean'
      || !Array.isArray(script.button.buttons)
      || !hubHostKeys(script.export_with, ['data', 'button']) || typeof script.export_with.data !== 'boolean'
      || typeof script.export_with.button !== 'boolean') invalid();
    for (const button of script.button.buttons) {
      if (!hubHostKeys(button, ['name', 'visible']) || typeof button.name !== 'string' || typeof button.visible !== 'boolean') invalid();
    }
    registerId(script.id);
    scripts.push(script);
  };
  if (!Array.isArray(trees)) invalid();
  for (const tree of trees) {
    if (tree?.type === 'script') validateScript(tree);
    else if (tree?.type === 'folder') {
      if (!hubHostKeys(tree, ['type', 'enabled', 'name', 'id', 'icon', 'color', 'scripts'])
        || typeof tree.enabled !== 'boolean' || typeof tree.name !== 'string' || typeof tree.icon !== 'string'
        || typeof tree.color !== 'string' || !Array.isArray(tree.scripts)) invalid();
      registerId(tree.id);
      // Tavern Helper 4.9.3 only accepts scripts inside a folder, not folders.
      for (const script of tree.scripts) validateScript(script);
    } else invalid();
  }
  return scripts;
}

function hubHostCandidate(script) {
  return script.id === hubHostPackageId
    || script.content.startsWith('// MieMie-Hub-Build:')
    || /^\/\/ 咩咩Hub(?:\s|$)/.test(script.content);
}

function hubHostLocate(trees, id, version) {
  const scripts = hubHostValidateTree(trees);
  const matches = scripts.filter(script => script.id === id);
  if (matches.length !== 1) throw hubHostError('HOST_NOT_GLOBAL', '无法在全局脚本中唯一找到当前 Hub；第一代自动更新仅支持全局脚本，不支持角色或预设脚本。');
  const candidates = scripts.filter(hubHostCandidate);
  if (candidates.length > 1) throw hubHostError('HOST_AMBIGUOUS', '检测到多个 Hub 脚本候选，已拒绝自动更新；请先在酒馆助手中确认保留的 Hub 实例。');
  const target = matches[0];
  const identity = parseHubBuildIdentity(target.content);
  if (!identity || identity.version !== version) throw hubHostError('HOST_IDENTITY', '当前脚本的 Hub 身份或版本与运行实例不一致，已拒绝自动更新。');
  return target;
}

export function createHubScriptHost({getScriptId, getScriptTrees, updateScriptTreesWith, currentVersion} = {}) {
  const requireApis = write => {
    if (typeof getScriptId !== 'function' || typeof getScriptTrees !== 'function'
      || (write && typeof updateScriptTreesWith !== 'function')) {
      throw hubHostError('HOST_UNAVAILABLE', '当前酒馆助手没有提供所需的正式脚本 API，无法自动更新；请手动导入新版。');
    }
    if (typeof currentVersion !== 'string' || !hubHostVersionPattern.test(currentVersion)) {
      throw hubHostError('HOST_IDENTITY', '当前 Hub 构建版本无效，已拒绝自动更新。');
    }
  };
  const runtimeId = () => {
    let id;
    try { id = getScriptId(); }
    catch { throw hubHostError('HOST_IDENTITY', '无法取得当前 Hub iframe 的脚本 ID，已拒绝自动更新。'); }
    if (typeof id !== 'string' || !id.trim()) throw hubHostError('HOST_IDENTITY', '当前 Hub iframe 的脚本 ID 无效，已拒绝自动更新。');
    return id;
  };
  const makeSnapshot = script => ({id: script.id, scope: 'global', content: script.content, script: hubHostClone(script)});
  return {
    snapshot() {
      requireApis(false);
      const id = runtimeId();
      let trees;
      try { trees = getScriptTrees({type: 'global'}); }
      catch { throw hubHostError('HOST_READ', '读取全局脚本失败，已拒绝自动更新。'); }
      if (trees && typeof trees.then === 'function') {
        Promise.resolve(trees).catch(() => {});
        throw hubHostError('HOST_ASYNC', '宿主返回了不支持的异步脚本树，已拒绝自动更新。');
      }
      return makeSnapshot(hubHostLocate(trees, id, currentVersion));
    },
    install(snapshot, newContent) {
      requireApis(true);
      if (!snapshot || snapshot.scope !== 'global' || typeof snapshot.id !== 'string'
        || typeof snapshot.content !== 'string' || runtimeId() !== snapshot.id) {
        throw hubHostError('HOST_CHANGED', '当前 Hub 安装实例已变化，已取消自动更新。');
      }
      const previousIdentity = parseHubBuildIdentity(snapshot.content);
      const nextIdentity = parseHubBuildIdentity(newContent);
      if (!previousIdentity || previousIdentity.version !== currentVersion || !nextIdentity) {
        throw hubHostError('HOST_IDENTITY', '待安装代码的 Hub 身份或版本标记无效，已拒绝自动更新。');
      }
      let acceptingCallback = true;
      let callbackCount = 0;
      let result;
      try {
        result = updateScriptTreesWith(trees => {
          if (!acceptingCallback || ++callbackCount !== 1) {
            throw hubHostError('HOST_ASYNC', '宿主未同步执行唯一一次脚本更新，已拒绝继续写入。');
          }
          if (runtimeId() !== snapshot.id) throw hubHostError('HOST_CHANGED', '当前 Hub 安装实例已变化，已取消自动更新。');
          const target = hubHostLocate(trees, snapshot.id, currentVersion);
          if (target.content !== snapshot.content) throw hubHostError('HOST_CHANGED', 'Hub 脚本内容已被其他操作修改，请重新检查更新后再试。');
          target.content = newContent;
          return trees;
        }, {type: 'global'});
      } catch (error) {
        if (typeof error?.code === 'string' && error.code.startsWith('HOST_')) throw error;
        throw hubHostError('HOST_WRITE', '酒馆助手脚本写入失败；请检查当前脚本状态，不要重复覆盖其他脚本。');
      } finally { acceptingCallback = false; }
      if (result && typeof result.then === 'function') {
        // The real audited API is synchronous when supplied a synchronous updater.
        // If a different host defers the callback, the closed gate above stops it.
        Promise.resolve(result).catch(() => {});
        throw hubHostError('HOST_ASYNC', '宿主返回了不支持的异步写入结果，保存状态尚未确认，请检查脚本状态。');
      }
      if (callbackCount !== 1) throw hubHostError('HOST_WRITE', '宿主没有执行脚本更新，已取消自动更新。');
      const installed = hubHostLocate(result, snapshot.id, nextIdentity.version);
      if (installed.content !== newContent) throw hubHostError('HOST_WRITE', '宿主返回的脚本内容与目标不一致，保存状态尚未确认。');
      // This confirms only the synchronous in-memory API result, not durable save.
      return makeSnapshot(installed);
    },
  };
}
