// Registry sessions are kept only in this iframe's memory, never in Catalog or storage.
export function registryBaseURL(value) {
  if (!value) return '';
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw Error('Registry 地址必须使用 HTTPS（本机开发可使用 HTTP）。');
  if (url.pathname !== '/' && url.pathname !== '') throw Error('Registry 地址请填写服务根地址。');
  return url.origin;
}

export function createRegistryClient({host, fetch: request = globalThis.fetch, crypto = globalThis.crypto, timeoutMs = 15000, loginTimeoutMs = 180000, onChange = () => {}} = {}) {
  let base = '', token = '', identity = null, disposed = false, loginOperation = null, cancelLogin = null;
  const controllers = new Set();
  const notify = () => {try {onChange(identity);} catch (_) {}};
  const clearSession = () => {token = ''; identity = null; notify();};
  function setBase(value) {
    const next = registryBaseURL(value);
    if (next !== base) { cancelLogin?.(); for (const c of controllers) c.abort(); clearSession(); base = next; }
    return base;
  }
  async function api(path, {method = 'GET', body, authenticated = false} = {}) {
    if (disposed) throw Error('Registry 连接已关闭。');
    if (!base) throw Error('尚未配置 Registry 地址；本地扩展仍可正常使用。');
    if (!/^\/api\/[A-Za-z0-9/?=&%._+~-]+$/.test(path)) throw Error('Registry API 路径无效。');
    if (authenticated && !token) throw Error('请先使用 Discord 登录。');
    const requestBase = base;
    const controller = new AbortController(); controllers.add(controller);
    let timer;
    const expired = new Promise((_, reject) => { timer = setTimeout(() => {controller.abort(); reject(Error('Registry 请求超时。'));}, timeoutMs); });
    const cancelled = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(Error('Registry 请求已取消。')), {once: true}));
    try {
      return await Promise.race([expired, cancelled, (async () => {
        const headers = {Accept: 'application/json'};
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (authenticated) headers.Authorization = 'Bearer ' + token;
        const response = await request(requestBase + path, {method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, credentials: 'omit', mode: 'cors', redirect: 'error', referrerPolicy: 'no-referrer'});
        if (disposed || controller.signal.aborted || base !== requestBase) throw Error('Registry 请求已取消。');
        if (response.status === 401) clearSession();
        if (Number(response.headers?.get('content-length')) > 2 * 1024 * 1024 || !response.body?.getReader) throw Error('Registry 响应过大或不可读取。');
        const reader = response.body.getReader(), chunks = []; let size = 0;
        const cancelBody = () => {void reader.cancel().catch(() => {});}; controller.signal.addEventListener('abort', cancelBody, {once: true});
        try {for (;;) {const {done,value} = await reader.read(); if (done) break; size += value.byteLength; if (size > 2 * 1024 * 1024) throw Error('Registry 响应过大。'); chunks.push(value);}}
        finally {controller.signal.removeEventListener('abort', cancelBody); void reader.cancel().catch(() => {});}
        const data = new Uint8Array(size); let offset = 0; for (const chunk of chunks) {data.set(chunk,offset); offset += chunk.byteLength;}
        const text = new TextDecoder('utf-8', {fatal:true}).decode(data);
        let result; try {result = JSON.parse(text);} catch (_) {throw Error('Registry 返回格式异常。');}
        if (!response.ok) throw Error(typeof result.error?.message === 'string' ? result.error.message.slice(0, 300) : typeof result.error === 'string' ? result.error.slice(0, 300) : 'Registry 请求失败（' + response.status + '）。');
        if (disposed || controller.signal.aborted) throw Error('Registry 请求已取消。');
        return result;
      })()]);
    } catch (error) {throw Error(error?.message || 'Registry 网络连接失败。');}
    finally {clearTimeout(timer); controllers.delete(controller);}
  }
  function login() {
    if (loginOperation) return loginOperation;
    if (!base || disposed) return Promise.reject(Error('请先配置 Registry 地址。'));
    // Open synchronously inside the click gesture; navigate only after state/PKCE preparation.
    const popup = host.open('about:blank', 'miemie-registry-login', 'popup,width=520,height=720');
    if (!popup) return Promise.reject(Error('登录窗口被浏览器阻止，请允许此页面弹出窗口。'));
    const expectedOrigin = base;
    loginOperation = (async () => {
      let listener, timer, closePoll;
      try {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        const encode = data => host.btoa(String.fromCharCode(...data)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        const verifier = encode(bytes);
        const challenge = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
        const started = await api('/api/auth/start', {method: 'POST', body: {codeChallenge: challenge, returnOrigin: host.location.origin}});
        const auth = new URL(started.authorizationUrl);
        if (auth.origin !== expectedOrigin || auth.pathname !== '/api/auth/authorize' || auth.username || auth.password || auth.searchParams.get('requestId') !== started.requestId || typeof started.requestId !== 'string') throw Error('Registry 返回的 Discord 登录地址无效。');
        const result = await new Promise((resolve, reject) => {
          let exchanging = false;
          cancelLogin = () => reject(Error('登录已取消。'));
          timer = setTimeout(() => reject(Error('Discord 登录超时，请重新登录。')), loginTimeoutMs);
          closePoll = setInterval(() => {if (popup.closed && !exchanging) reject(Error('登录窗口已关闭。'));}, 500);
          listener = async event => {
            if (event.origin !== expectedOrigin || event.source !== popup || event.data?.type !== 'miemie-registry-auth' || event.data.requestId !== started.requestId || exchanging) return;
            if (typeof event.data.code !== 'string' || event.data.code.length > 512) return;
            exchanging = true;
            try {resolve(await api('/api/auth/exchange', {method: 'POST', body: {code: event.data.code, codeVerifier: verifier, requestId: started.requestId}}));}
            catch (error) {reject(error);}
          };
          host.addEventListener('message', listener);
          popup.location.href = auth.href;
        });
        if (disposed || base !== expectedOrigin) throw Error('登录上下文已改变。');
        if (typeof result.token !== 'string' || !result.token || !result.profile || typeof result.profile.displayName !== 'string') throw Error('登录响应异常。');
        token = result.token; identity = {profile: result.profile, isAdmin: result.isAdmin === true, expiresAt: result.expiresAt}; notify(); return identity;
      } finally {
        clearTimeout(timer); clearInterval(closePoll); if (listener) host.removeEventListener('message', listener);
        cancelLogin = null; try {popup.close();} catch (_) {}
      }
    })().finally(() => {loginOperation = null;});
    return loginOperation;
  }
  return {setBase, getBase: () => base, getIdentity: () => identity, api, login,
    async logout() {try {if (token) await api('/api/auth/logout', {method: 'POST', authenticated: true});} finally {clearSession();}},
    async me() {const result = await api('/api/me', {authenticated: true}); identity = result; notify(); return result;},
    dispose() {disposed = true; cancelLogin?.(); for (const c of controllers) c.abort(); clearSession();},
  };
}
