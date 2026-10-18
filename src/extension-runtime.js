import {HUB_PRODUCT} from './product-identity.js';
// The schema describes the declaration; the Runtime supports exactly API 2.
// Package identity and machine format validation do not grant execution rights.
export function validateExtensionAPIDeclaration(manifest) {
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(manifest) || manifest.schemaVersion !== 1 || !Number.isSafeInteger(manifest.apiVersion) || manifest.apiVersion < 1) {
    throw Object.assign(Error('Manifest Schema 1 与正整数 apiVersion 必须明确声明。'), {code: 'manifest'});
  }
  const range = manifest.hubApi;
  if (range !== undefined && (!object(range) || !Number.isSafeInteger(range.min) || !Number.isSafeInteger(range.max)
      || range.min < 1 || range.min > range.max || range.min > manifest.apiVersion || range.max < manifest.apiVersion)) {
    throw Object.assign(Error('hubApi 范围必须有效并包含声明的 API 版本。'), {code: 'manifest'});
  }
}
export function assertExtensionRuntimeCompatibility(manifest) {
  validateExtensionAPIDeclaration(manifest);
  if (manifest.apiVersion !== 2) throw Object.assign(Error('此扩展声明 API ' + manifest.apiVersion + '，当前 Hub 仅支持 Extension API 2；未执行安装或启用。'), {code: 'api-incompatible'});
}
// Local, cooperative extensions only. This is not a package loader or sandbox.
export function createExtensionRuntime(options = {}) {
  const records = new Map();
  const guardedCallbacks = new WeakMap();
  const timeoutMs = options.timeoutMs ?? 10000;
  let disposed = false;
  const messageOf = error => error instanceof Error ? error.message : String(error);
  const copy = value => JSON.parse(JSON.stringify(value));
  const failResult = error => ({ok: false, error: messageOf(error), ...(error?.code ? {code: error.code} : {})});

  function notify(kind, record) {
    try { options.onChange?.({kind, extension: snapshot(record)}); }
    catch (error) { console.warn('['+HUB_PRODUCT.englishName+'] UI notification failed', error); }
  }
  function snapshot(record) {
    return {
      manifest: copy(record.manifest),
      classification: record.classification,
      state: record.state,
      enabled: record.state === 'enabled',
      busy: ['enabling', 'disabling', 'uninstalling'].includes(record.state),
      error: record.error,
      launcherAvailable: record.state === 'enabled' && record.session?.launcherAvailable === true,
      launcherError: record.launcherError,
      nativeWindowAvailable: record.state === 'enabled' && !!record.session?.hasNativeWindow,
    };
  }
  function validate(manifest) {
    const m = copy(manifest);
    assertExtensionRuntimeCompatibility(m);
    if (typeof m.id !== 'string' || !/^[a-z0-9][a-z0-9._-]{1,79}$/.test(m.id)) throw Error('扩展 ID 无效。');
    if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 80) throw Error('扩展名称无效。');
    if (typeof m.version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?$(?![\s\S])/.test(m.version)) throw Error('扩展版本需使用合法的 x.y.z 格式。');
    if (m.contributes?.launcher !== undefined) {
      const launcher = m.contributes.launcher;
      if (!launcher || typeof launcher !== 'object' || typeof launcher.title !== 'string' || !launcher.title.trim() || launcher.title.length > 60) throw Error('快捷入口标题无效。');
      if (launcher.icon !== undefined && (typeof launcher.icon !== 'string' || launcher.icon.length > 16)) throw Error('本阶段快捷入口图标仅支持短文本或 emoji。');
    }
    return m;
  }
  function bounded(fn, label, limit = timeoutMs) {
    let timer;
    return Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => { timer = (options.setTimeout || setTimeout)(() => reject(Error(label + '超时。')), limit); }),
    ]).finally(() => (options.clearTimeout || clearTimeout)(timer));
  }
  function report(record, phase, error) {
    record.error = phase + '：' + messageOf(error);
    try { options.onError?.(record.manifest.id, record.error); } catch (_) {}
  }
  function launcherFailure(record, message) {
    record.launcherError = message;
    try { console.warn('['+HUB_PRODUCT.englishName+'] ' + record.manifest.id + ' · ' + message); } catch (_) {}
    notify('launcher', record);
    return failResult(message);
  }
  function revoke(record) {
    record.generation++;
    if (record.session) {
      record.session.backHandler = null;
      record.session.active = false;
      record.session.controller.abort();
    }
  }
  async function cleanOne(record, fn) {
    try { await bounded(fn, '清理', Math.min(timeoutMs, 2000)); }
    catch (error) { report(record, '清理', error); }
  }
  async function teardown(record) {
    const session = record.session;
    if (!session) return;
    record.session = null;
    session.backHandler = null;
    session.active = false;
    session.closed = true;
    session.controller.abort();
    try { options.onClose?.(record.manifest.id); } catch (_) {}
    try {
      // Reading an Extension-owned lifecycle property can itself throw.
      if (typeof session.instance?.deactivate === 'function') await bounded(() => session.instance.deactivate(), '停用');
    } catch (error) { report(record, '停用', error); }
    // A failed disposer does not prevent the remaining disposers from running.
    for (const fn of session.cleanups.splice(0).reverse()) await cleanOne(record, fn);
  }
  function enqueue(record, action) {
    const result = record.queue.then(action, action).catch(async error => {
      report(record, '运行', error);
      revoke(record);
      await teardown(record);
      record.state = 'error';
      notify('error', record);
      return failResult(error);
    });
    record.queue = result;
    return result;
  }
  function current(record, session) {
    return !disposed && records.get(record.manifest.id) === record && record.session === session && session.active && !session.closed && !session.controller.signal.aborted;
  }
  function context(record, session) {
    return Object.freeze({
      manifest: copy(record.manifest),
      signal: session.controller.signal,
      showMessage(text) {
        if (!current(record, session) || record.state !== 'enabled') return false;
        if (typeof text !== 'string') throw Error('消息必须是文本。');
        options.onMessage?.(record.manifest.id, record.manifest.name, text);
        return true;
      },
      attachPanel(panel, presentation = {}) {
        if (!current(record, session)) return false;
        if (session.hasPanel) throw Error('一个扩展只能挂载一个主面板。');
        const detach = options.onPanel?.(record.manifest.id, record.manifest.name, panel, presentation);
        if (typeof detach !== 'function') throw Error('Hub 未提供面板挂载功能。');
        session.hasPanel = true;
        // Release Hub-owned UI on revocation, before Extension cleanup or a
        // Standalone handoff. The existing cleanup stack only retires this lease.
        let attached = true;
        const release = () => {if (!attached) return; attached = false; try {detach({handoff: disposed});} catch (error) {report(record, '清理', error);}};
        session.controller.signal.addEventListener('abort', release, {once: true});
        session.cleanups.push(() => {session.controller.signal.removeEventListener('abort', release); release();});
        if (session.controller.signal.aborted) release();
        return true;
      },
      registerNativeWindow(provider) {
        if (!current(record,session)) return false;
        if (!session.hasPanel || !record.manifest.contributes?.launcher) throw Error('Native Window 需要主面板和 Launcher。');
        if (session.hasNativeWindow || typeof provider?.mount !== 'function' || typeof provider?.open !== 'function' || typeof provider?.release !== 'function' || (provider.ownsEvent !== undefined && typeof provider.ownsEvent !== 'function')) throw Error('Native Window capability 无效或重复。');
        // Capture only declared functions. No mutable provider or Runtime record escapes.
        const {mount,open,release,ownsEvent}=provider;
        if([mount,open,release,ownsEvent].some(fn=>guardedCallbacks.has(fn)))throw Error('Native Window 回调不能使用异步 api.guard()。');
        const retire=options.onNativeWindow?.(record.manifest.id,Object.freeze({mount,open,release,ownsEvent}));
        const detach=typeof retire==='function'?()=>retire(disposed?'hub-dispose':'session-end'):null;
        if(typeof detach!=='function')throw Error('Hub 未提供 Native Window capability。');
        session.hasNativeWindow=true;
        session.controller.signal.addEventListener('abort',detach,{once:true});
        session.cleanups.push(()=>{session.controller.signal.removeEventListener('abort',detach);detach();});
        if(record.state==='enabled')notify('launcher',record);
        return true;
      },
      showPanel(lease) {
        if (!current(record, session) || record.state !== 'enabled') return false;
        if (!session.hasPanel) throw Error('扩展尚未挂载面板。');
        if (!lease || session.surfaceLease !== lease || !lease.isCurrent()) return false;
        return options.onShowPanel?.(record.manifest.id, lease) ?? false;
      },
      closePanel(lease) {
        if (!current(record,session) || record.state !== 'enabled' || !session.hasPanel) return false;
        if (!lease || session.surfaceLease !== lease || !lease.isCurrent()) return false;
        return options.onClosePanel?.(record.manifest.id, lease) ?? false;
      },
      registerBackHandler(handler) {
        if (!current(record, session)) return false;
        if (!session.hasPanel) throw Error('Back capability 需要已挂载的主面板。');
        if (session.backHandler || typeof handler !== 'function') throw Error('Back capability 无效或重复。');
        // guard() is asynchronous and tears down on error; Back must preserve drafts.
        if (guardedCallbacks.has(handler)) throw Error('Back handler 必须同步返回 boolean，不能使用 api.guard()。');
        session.backHandler = handler;
        return true;
      },
      onCleanup(fn) {
        if (typeof fn !== 'function') throw Error('清理回调必须是函数。');
        if (session.closed) void cleanOne(record, fn);
        else session.cleanups.push(fn);
        return fn;
      },
      guard(fn) {
        if (typeof fn !== 'function') throw Error('回调必须是函数。');
        const guarded = (...args) => {
          if (!current(record, session)) return Promise.resolve(false);
          return Promise.resolve().then(() => current(record, session) ? fn(...args) : false).catch(error => {
            if (!current(record, session)) return false;
            report(record, '回调', error);
            revoke(record);
            record.state = 'disabling';
            notify('transition', record);
            void enqueue(record, async () => {
              await teardown(record);
              record.state = 'error';
              notify('error', record);
              return false;
            });
            // A guarded callback may itself be awaited inside open/activate.
            // Do not wait for its own queue here.
            return false;
          });
        };
        // A directly guarded open() uses the launcher's error boundary. Other
        // callbacks retain their existing extension-level failure handling.
        guardedCallbacks.set(guarded, {fn, session});
        return guarded;
      },
    });
  }
  function register(manifest, factory) {
    try {
      if (disposed) throw Error('Hub 扩展运行器已关闭。');
      const m = validate(manifest);
      if (records.has(m.id)) throw Error('扩展已注册：' + m.id);
      if (typeof factory !== 'function') throw Error('扩展工厂必须是函数。');
      // The Host supplies this resolver at construction; register/provide callers
      // cannot assign identity through a manifest or an extra argument.
      const classification = options.resolveClassification?.(m, factory) === 'official' ? 'official' : 'community';
      const record = {manifest: m, factory, classification, state: 'disabled', error: '', launcherError: '', generation: 0, session: null, queue: Promise.resolve()};
      records.set(m.id, record);
      notify('register', record);
      return {ok: true, extension: snapshot(record)};
    } catch (error) { return failResult(error); }
  }
  function enable(id) {
    const record = records.get(id);
    if (!record || disposed) return Promise.resolve(failResult('扩展未注册或 Hub 已关闭。'));
    if (record.state === 'enabled') return Promise.resolve({ok: true});
    const generation = ++record.generation;
    return enqueue(record, async () => {
      if (disposed || records.get(id) !== record || generation !== record.generation) return {ok: false, cancelled: true};
      await teardown(record);
      record.error = '';
      record.launcherError = '';
      record.state = 'enabling';
      const session = {controller: new AbortController(), active: true, closed: false, cleanups: [], instance: null};
      record.session = session;
      notify('transition', record);
      try {
        const api = context(record, session);
        // Never expose the private runtime record as an extension's receiver.
        // Lifecycle methods still run on the extension's own returned instance.
        const factory = record.factory;
        const creation = Promise.resolve().then(() => factory(api)).then(instance => {
          if (!instance || typeof instance !== 'object') throw Error('扩展工厂必须返回生命周期对象。');
          if (!session.closed) session.instance = instance;
          for (const name of ['activate', 'deactivate']) if (instance[name] !== undefined && typeof instance[name] !== 'function') throw Error(name + ' 必须是函数。');
          if (session.closed) {
            if (typeof instance.deactivate === 'function') void cleanOne(record, () => instance.deactivate());
          }
          return instance;
        });
        const instance = await bounded(() => creation, '创建');
        if (!current(record, session) || generation !== record.generation) {
          await teardown(record); record.state = 'disabled'; return {ok: false, cancelled: true};
        }
        if (instance.activate) await bounded(() => instance.activate(), '启用');
        if (!current(record, session) || generation !== record.generation) {
          await teardown(record); record.state = 'disabled'; return {ok: false, cancelled: true};
        }
        record.state = 'enabled';
        if (record.manifest.contributes?.launcher) {
          try {
            session.launcherAvailable = typeof instance.open === 'function';
            if (!session.launcherAvailable) launcherFailure(record, 'Launcher 不可用：已声明快捷入口，但没有可调用的 open()。扩展仍保持启用。');
          } catch (error) {
            launcherFailure(record, 'Launcher 不可用：无法读取 open()：' + messageOf(error));
          }
        }
        notify('enable', record);
        return {ok: true};
      } catch (error) {
        report(record, '启用', error);
        revoke(record);
        await teardown(record);
        record.state = 'error';
        notify('error', record);
        return failResult(error);
      }
    });
  }
  function disable(id) {
    const record = records.get(id);
    if (!record || disposed) return Promise.resolve(failResult('扩展未注册或 Hub 已关闭。'));
    revoke(record);
    record.state = 'disabling';
    notify('transition', record);
    return enqueue(record, async () => {
      await teardown(record);
      record.state = 'disabled';
      notify('disable', record);
      return {ok: true, cleanupError: record.error || null};
    });
  }
  function uninstall(id) {
    const record = records.get(id);
    if (!record || disposed) return Promise.resolve(failResult('扩展未注册或 Hub 已关闭。'));
    revoke(record);
    record.state = 'uninstalling';
    notify('transition', record);
    return enqueue(record, async () => {
      await teardown(record);
      if (records.get(id) === record) records.delete(id);
      record.state = 'uninstalled';
      notify('uninstall', record);
      return {ok: true, cleanupError: record.error || null};
    });
  }
  function open(id) {
    const record = records.get(id), session = record?.session;
    if (!record || record.state !== 'enabled' || !session || !current(record, session)) return Promise.resolve(failResult('请先启用扩展。'));
    // Capture intent before the Runtime queue; a late completion cannot mint one.
    const lease = options.onRequestOpen?.(id);
    session.surfaceLease = lease;
    const valid = () => current(record, session) && record.state === 'enabled' && lease?.isCurrent() === true;
    if (!valid()) return Promise.resolve({ok:false,cancelled:true});
    return enqueue(record, async () => {
      if (!valid()) return {ok: false, cancelled: true};
      try {
        const handler = session.instance.open;
        if (typeof handler !== 'function') {
          session.launcherAvailable = false;
          return record.manifest.contributes?.launcher
            ? launcherFailure(record, 'Launcher 不可用：没有可调用的 open()。扩展仍保持启用。')
            : failResult('此扩展没有可打开的界面。');
        }
        const guarded = guardedCallbacks.get(handler);
        const callback = guarded?.session === session ? guarded.fn : handler;
        if(options.onBeforeOpen?.(id,lease)===false)throw Error('Native Window 未能释放控制权。');
        await bounded(() => valid() ? callback.call(session.instance, lease) : false, '打开');
        if (!valid()) return record.error ? failResult(record.error) : {ok: false, cancelled: true};
        if (record.launcherError) { record.launcherError = ''; notify('launcher', record); }
        return {ok: true};
      }
      catch (error) {
        if (!valid()) return {ok: false, cancelled: true};
        options.onCancelOpen?.(id,lease);
        return launcherFailure(record, '扩展界面打开失败：' + messageOf(error));
      }
    });
  }
  async function dispose() {
    if (disposed) return;
    disposed = true;
    await Promise.allSettled([...records.values()].map(record => {
      revoke(record);
      return enqueue(record, () => teardown(record));
    }));
    records.clear();
  }
  // Host-private dispatch. Never exported on publicHub.extensions or on api.
  function hasBackHandler(id) {
    const record = records.get(id), session = record?.session;
    return !!(session && current(record, session) && record.state === 'enabled' && session.backHandler);
  }
  function requestBack(id, request) {
    const record = records.get(id), session = record?.session;
    if (!hasBackHandler(id)) return {handled: true}; // Revocation must not close a replacement.
    if (session.backDispatching) return {handled: true};
    const isCurrent = () => current(record, session) && record.state === 'enabled' && request.isCurrent();
    if (!isCurrent()) return {handled: true};
    session.backDispatching = true;
    try {
      const handler = session.backHandler;
      const result = handler(Object.freeze({source: request.source, isCurrent}));
      if (result !== true && result !== false) {
        // Observe accidental async rejection without waiting or using guard teardown.
        Promise.resolve(result).catch(() => {});
        throw Error('Back handler 必须同步返回 true 或 false。');
      }
      return {handled: !isCurrent() || result};
    } catch (error) {
      let detail = '未知错误';
      try { detail = messageOf(error); } catch (_) {}
      return {handled: true, error: '返回处理失败：' + detail};
    } finally { session.backDispatching = false; }
  }
  return Object.freeze({
    register, enable, disable, uninstall, open, dispose,
    hasBackHandler, requestBack,
    list: () => [...records.values()].map(snapshot),
    get: id => records.has(id) ? snapshot(records.get(id)) : null,
    // Internal validation for local source registration; not an installer API.
    validate,
  });
}
