// Local, cooperative extensions only. This is not a package loader or sandbox.
export function createExtensionRuntime(options = {}) {
  const records = new Map();
  const guardedCallbacks = new WeakMap();
  const timeoutMs = options.timeoutMs ?? 10000;
  let disposed = false;
  const messageOf = error => error instanceof Error ? error.message : String(error);
  const copy = value => JSON.parse(JSON.stringify(value));
  const failResult = error => ({ok: false, error: messageOf(error)});

  function notify(kind, record) {
    try { options.onChange?.({kind, extension: snapshot(record)}); }
    catch (error) { console.warn('[MieMie Hub] UI notification failed', error); }
  }
  function snapshot(record) {
    return {
      manifest: copy(record.manifest),
      state: record.state,
      enabled: record.state === 'enabled',
      busy: ['enabling', 'disabling', 'uninstalling'].includes(record.state),
      error: record.error,
      launcherAvailable: record.state === 'enabled' && record.session?.launcherAvailable === true,
      launcherError: record.launcherError,
    };
  }
  function validate(manifest) {
    const m = copy(manifest);
    if (m.schemaVersion !== 1 || m.apiVersion !== 1) throw Error('仅支持 Manifest / API 版本 1。');
    if (typeof m.id !== 'string' || !/^[a-z0-9][a-z0-9._-]{1,79}$/.test(m.id)) throw Error('扩展 ID 无效。');
    if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 80) throw Error('扩展名称无效。');
    if (typeof m.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(m.version)) throw Error('扩展版本需使用 x.y.z 格式。');
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
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + '超时。')), limit); }),
    ]).finally(() => clearTimeout(timer));
  }
  function report(record, phase, error) {
    record.error = phase + '：' + messageOf(error);
    try { options.onError?.(record.manifest.id, record.error); } catch (_) {}
  }
  function launcherFailure(record, message) {
    record.launcherError = message;
    try { console.warn('[MieMie Hub] ' + record.manifest.id + ' · ' + message); } catch (_) {}
    notify('launcher', record);
    return failResult(message);
  }
  function revoke(record) {
    record.generation++;
    if (record.session) {
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
    session.active = false;
    session.closed = true;
    session.controller.abort();
    try { options.onClose?.(record.manifest.id); } catch (_) {}
    if (typeof session.instance?.deactivate === 'function') {
      try { await bounded(() => session.instance.deactivate(), '停用'); }
      catch (error) { report(record, '停用', error); }
    }
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
        session.cleanups.push(detach);
        return true;
      },
      showPanel() {
        if (!current(record, session) || record.state !== 'enabled') return false;
        if (!session.hasPanel) throw Error('扩展尚未挂载面板。');
        return options.onShowPanel?.(record.manifest.id);
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
      const record = {manifest: m, factory, state: 'disabled', error: '', launcherError: '', generation: 0, session: null, queue: Promise.resolve()};
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
        const creation = Promise.resolve().then(() => record.factory(api)).then(instance => {
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
    return enqueue(record, async () => {
      if (!current(record, session) || record.state !== 'enabled') return {ok: false, cancelled: true};
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
        await bounded(() => current(record, session) ? callback.call(session.instance) : false, '打开');
        if (!current(record, session)) return record.error ? failResult(record.error) : {ok: false, cancelled: true};
        if (record.launcherError) { record.launcherError = ''; notify('launcher', record); }
        return {ok: true};
      }
      catch (error) {
        if (!current(record, session)) return {ok: false, cancelled: true};
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
  return Object.freeze({
    register, enable, disable, uninstall, open, dispose,
    list: () => [...records.values()].map(snapshot),
    get: id => records.has(id) ? snapshot(records.get(id)) : null,
    // Internal validation for local source registration; not an installer API.
    validate,
  });
}
