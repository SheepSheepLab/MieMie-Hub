import {createHash} from 'node:crypto';
export const PACKAGE_REPO = 'https://github.com/DevelopmentFixture/PackageContract';
export const PACKAGE_API = 'https://api.github.com/repos/DevelopmentFixture/PackageContract';
export const PACKAGE_PRODUCT = 'fixture.package-contract';
export const PACKAGE_SCRIPT = '9a000000-0000-4000-8000-000000000001';
export const packageHash = value => createHash('sha256').update(value).digest('hex');
export function packageFixture(version = '1.0.0', apiVersion = 2, patch = {}) {
  const manifest = {schemaVersion: 1, apiVersion, hubApi: {min: apiVersion, max: apiVersion}, id: PACKAGE_PRODUCT, name: 'Package Contract Fixture', version,
    author: 'Development Fixture', description: 'Isolated test only', entry: 'fixture.js', repository: PACKAGE_REPO, license: 'MIT', ...patch};
  const identity = {schemaVersion: 1, productId: PACKAGE_PRODUCT, version, scriptId: PACKAGE_SCRIPT, repository: PACKAGE_REPO};
  // A real background API2 registration, with source withdrawal on Helper unload.
  const content = '// MieMie-Extension-Build: ' + JSON.stringify(identity) + '\n' + `(() => {
    const host = window.parent, manifest = ${JSON.stringify(manifest)};
    let source; const connect = () => {if (!source && host.__MieMieHub?.apiVersion === manifest.apiVersion) source = host.__MieMieHub.extensions.provide(manifest, () => ({activate(){}, deactivate(){}}));};
    host.addEventListener('miemie:hub-ready', connect); connect();
    const dispose = () => {host.removeEventListener('miemie:hub-ready', connect); source?.release();};
    window.addEventListener('pagehide', dispose, {once:true}); window.addEventListener('unload', dispose, {once:true});
  })();`;
  const script = {type: 'script', id: PACKAGE_SCRIPT, name: 'Package Contract Fixture ' + version, content, enabled: true, info: '', button: {enabled: false, buttons: []}, data: {}, export_with: {data: false, button: false}};
  const bytes = Buffer.from(JSON.stringify(script));
  const metadata = {schemaVersion: 1, format: 'tavern-helper-script', productId: PACKAGE_PRODUCT, version, tag: 'v' + version, scriptId: PACKAGE_SCRIPT, manifest,
    asset: {name: 'Package-Fixture-' + version + '.json', size: bytes.length, sha256: packageHash(bytes)}, contentSha256: packageHash(content)};
  const metadataBytes = Buffer.from(JSON.stringify(metadata));
  const releaseId = 100 + Number(version.split('.')[0]), assetId = releaseId * 10;
  const asset = (id,name,value) => ({id,name,state:'uploaded',size:value.length,digest:'sha256:'+packageHash(value),url:PACKAGE_API+'/releases/assets/'+id,browser_download_url:PACKAGE_REPO+'/releases/download/v'+version+'/'+name});
  const release = {id:releaseId,tag_name:'v'+version,draft:false,prerelease:false,assets:[asset(assetId,metadata.asset.name,bytes),asset(assetId+1,'MieMie-Extension-update.json',metadataBytes)]};
  return {script,manifest,metadata,bytes,metadataBytes,release};
}
export function packageRoutes(fixtures) {
  const routes = {[PACKAGE_API]:{private:false,full_name:'DevelopmentFixture/PackageContract'},[PACKAGE_API+'/releases?per_page=100&page=1']:fixtures.map(f=>f.release)};
  for (const f of fixtures) {
    routes[PACKAGE_API+'/releases/'+f.release.id]=f.release;
    routes[PACKAGE_API+'/releases/tags/'+f.release.tag_name]=f.release;
    routes[f.release.assets[0].url]=f.bytes.toString(); routes[f.release.assets[1].url]=f.metadataBytes.toString();
  }
  return routes;
}
