// Bundling is a distribution choice. Every factory uses the same API v1 runtime.
// A failed bundled source cannot prevent Core or another source from starting.
export function loadBundledExtensions(entries, provide) {
  return Promise.allSettled(entries.map(entry => {
    try {
      const result = provide(entry.manifest, entry.factory);
      return result.ok ? result.ready : Promise.reject(Error(result.error));
    } catch (error) { return Promise.reject(error); }
  }));
}
