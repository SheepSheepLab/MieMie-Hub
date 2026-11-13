import {registryBaseURL} from './registry-client.js';

// Public Hub release metadata only. No host data, credentials or asset downloads.
export const HUB_RELEASES_API = 'https://api.github.com/repos/SheepSheepLab/MieMie-Hub/releases';
export const HUB_UPDATE_TIMEOUT_MS = 15000;
const RELEASE_PAGE_SIZE = 100, MAX_RELEASE_PAGES = 10;

export function parseSemVer(value) {
  if (typeof value !== 'string') return null;
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  if (!match || match[0] !== value) return null;
  const prerelease = match[4]?.split('.') || [];
  if (prerelease.some(id => /^\d+$/.test(id) && id.length > 1 && id[0] === '0')) return null;
  return {version: value.replace(/^v/, ''), core: match.slice(1, 4), prerelease};
}

function compareNumeric(a, b) {
  // Decimal strings avoid rounding arbitrarily large SemVer identifiers.
  return a.length === b.length ? (a === b ? 0 : a < b ? -1 : 1) : a.length < b.length ? -1 : 1;
}

export function compareSemVer(left, right) {
  const a = typeof left === 'string' ? parseSemVer(left) : left;
  const b = typeof right === 'string' ? parseSemVer(right) : right;
  if (!a || !b) throw Error('无效的语义版本。');
  for (let i = 0; i < 3; i++) {
    const order = compareNumeric(a.core[i], b.core[i]);
    if (order) return order;
  }
  if (!a.prerelease.length || !b.prerelease.length) return a.prerelease.length ? -1 : b.prerelease.length ? 1 : 0;
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
    const x = a.prerelease[i], y = b.prerelease[i];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    if (x === y) continue;
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    return xn && yn ? compareNumeric(x, y) : xn !== yn ? (xn ? -1 : 1) : x < y ? -1 : 1;
  }
  return 0; // Build metadata never changes precedence.
}

function failure(code, message) { return Object.assign(Error(message), {code, hubUpdateError: true}); }

export async function requestPublicGitHubRelease(request, url, init, registryBase) {
  const base = registryBaseURL(registryBase);
  if (!base) return request(url, init);
  const github = new URL(url);
  if (github.origin !== 'https://api.github.com' || github.username || github.password || github.hash ||
      !github.pathname.startsWith('/repos/')) {
    throw failure('release-route', 'GitHub Release 查询地址无效。');
  }
  const endpoint = base + '/api/github' + github.pathname + github.search;
  const {signal} = init;
  const direct = new AbortController();
  signal?.throwIfAborted();
  let interrupt;
  const interrupted = new Promise((_, reject) => {
    interrupt = () => {direct.abort();reject(Error('GitHub direct request interrupted'));};
  });
  signal?.addEventListener('abort', interrupt, {once:true});
  const timer = setTimeout(interrupt, 3500);
  try {
    const response = await Promise.race([request(url, {...init, signal:direct.signal}), interrupted]);
    if (response?.status !== 429 && !(response?.status === 403 && response.headers?.get('x-ratelimit-remaining') === '0')) return response;
    void response.body?.cancel().catch(() => {});
  } catch (_) {
    signal?.throwIfAborted();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', interrupt);
  }
  signal?.throwIfAborted();
  const response = await request(endpoint, {...init, headers:{Accept:'application/json'}, credentials:'omit', redirect:'error'});
  if (response?.url !== endpoint || response.redirected) throw failure('release-route', '在线服务返回了意外的 Release 地址。');
  return response;
}

export function selectLatestRelease(releases) {
  if (!Array.isArray(releases)) throw failure('invalid-data', 'GitHub 返回的数据格式异常，请稍后重试。');
  let latest = null;
  for (const release of releases) {
    if (!release || release.draft !== false) continue;
    const version = parseSemVer(release.tag_name);
    if (version && (!latest || compareSemVer(version, latest) > 0)) latest = {...version,
      releaseId: Number.isSafeInteger(release.id) && release.id > 0 ? release.id : null, tag: release.tag_name};
  }
  return latest;
}

export function createHubUpdateChecker({currentVersion, fetch: request = (...args) => globalThis.fetch(...args),
  timeoutMs = HUB_UPDATE_TIMEOUT_MS, getRegistryBaseURL = () => '', onChange = () => {}}) {
  let state = {status: 'unchecked', latestVersion: null, error: ''}, pending = null, disposed = false;
  const current = parseSemVer(currentVersion);
  function publish(next) { state = next; onChange({...state}); return {...state}; }
  async function query(signal) {
    if (!current) throw failure('invalid-version', '当前 Hub 版本格式异常。');
    const base = getRegistryBaseURL();
    let latest = null;
    for (let page = 1; page <= MAX_RELEASE_PAGES; page++) {
      signal.throwIfAborted();
      // Build every page URL locally; never follow response URLs or redirects.
      const response = await requestPublicGitHubRelease(request, HUB_RELEASES_API + '?per_page=' + RELEASE_PAGE_SIZE + '&page=' + page, {
        method: 'GET', headers: {Accept: 'application/vnd.github+json'},
        credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors', redirect: 'error', cache: 'no-store', signal,
      }, base);
      signal.throwIfAborted();
      if (getRegistryBaseURL() !== base) throw failure('release-route', '在线服务已切换，请重新检查。');
      if (!response || typeof response.ok !== 'boolean' || typeof response.json !== 'function') throw failure('invalid-data', 'GitHub 返回的数据格式异常，请稍后重试。');
      if (!response.ok) throw failure('http', 'GitHub API 返回 HTTP ' + response.status + '，请稍后重试。');
      let releases;
      try { releases = await response.json(); }
      catch (_) { throw failure('invalid-data', 'GitHub 返回的数据格式异常，请稍后重试。'); }
      signal.throwIfAborted();
      const candidate = selectLatestRelease(releases);
      if (releases.length > RELEASE_PAGE_SIZE) throw failure('invalid-data', 'GitHub 返回的数据格式异常，请稍后重试。');
      if (candidate && (!latest || compareSemVer(candidate, latest) > 0)) latest = candidate;
      if (releases.length < RELEASE_PAGE_SIZE) {
        if (!latest) throw failure('no-release', '未找到有效的 Hub Release，请稍后重试。');
        const order = compareSemVer(current, latest);
        return {status: order < 0 ? 'available' : order > 0 ? 'ahead' : 'current', latestVersion: latest.version, error: '',
          targetRelease: latest.releaseId ? {releaseId: latest.releaseId, version: latest.version, tag: latest.tag} : null};
      }
    }
    // Never claim to be current after examining only part of the release list.
    throw failure('page-limit', 'Release 列表过长，未能完成检查，请稍后重试。');
  }
  function check() {
    if (disposed) return Promise.resolve({status: 'cancelled'});
    if (pending) return pending.promise;
    const controller = new AbortController(), task = {controller};
    const cancelled = new Promise((_, reject) => {
      task.cancel = error => { reject(error); controller.abort(); clearTimeout(task.timer); };
    });
    pending = task;
    // Settle even if a host fetch wrapper ignores AbortSignal or its JSON stalls.
    task.promise = Promise.race([Promise.resolve().then(() => query(controller.signal)), cancelled])
      .then(result => disposed ? {status: 'cancelled'} : publish(result))
      .catch(error => disposed ? {status: 'cancelled'} : publish({status: 'failed', latestVersion: null,
        error: error?.hubUpdateError ? error.message : '网络不可用或 GitHub API 无法连接，请稍后重试。'}))
      .finally(() => {clearTimeout(task.timer); if (pending === task) pending = null;});
    task.timer = setTimeout(() => task.cancel(failure('timeout', '检查超时，请稍后重试。')), timeoutMs);
    publish({status: 'checking', latestVersion: null, error: ''});
    return task.promise;
  }
  return {
    check, getState: () => ({...state}),
    dispose() {
      if (disposed) return;
      disposed = true; onChange = () => {};
      pending?.cancel(failure('cancelled', '检查已取消。'));
    },
  };
}
