// Optional development override. This control belongs only to Core Settings.
export function createRegistryDeveloperSettings({host, body, registry}) {
  const doc = host.document, key = 'miemie_registry_url_v1';
  const details = doc.createElement('details'); details.dataset.hubDeveloperSettings = '';
  const summary = doc.createElement('summary'); summary.textContent = '高级 / 开发者选项';
  const label = doc.createElement('label'); label.textContent = '自定义 Registry 服务地址';
  const input = doc.createElement('input'); input.type = 'url'; input.maxLength = 2048;
  input.setAttribute('aria-label', 'Registry 服务地址'); input.value = registry.getBase();
  input.placeholder = registry.getDefaultBase?.() || 'http://127.0.0.1:8787';
  const note = doc.createElement('p'); note.className = 'mm-hub-note';
  note.textContent = '仅供开发测试或自定义服务使用。普通用户使用内置官方服务，无需填写；留空保存恢复内置地址。切换服务会退出当前登录。没有内置服务的开发构建需在此配置本机服务。';
  const status = doc.createElement('p'); status.className = 'mm-hub-note'; status.setAttribute('role', 'status');
  const save = doc.createElement('button'); save.type = 'button'; save.dataset.action = 'registry:configure'; save.textContent = '保存连接';
  let disposed = false;
  save.onclick = () => {
    if (disposed) return;
    try {
      const override = input.value.trim(), previous = registry.getBase();
      registry.setBase(override || registry.getDefaultBase?.() || '');
      try {
        if (override) host.localStorage.setItem(key, registry.getBase()); else host.localStorage.removeItem(key);
      } catch (_) {registry.setBase(previous); throw Error('浏览器无法保存设置，请检查本地存储权限。');}
      input.value = registry.getBase(); status.textContent = override ? '自定义连接已保存。' : '已恢复构建内置服务地址。';
    } catch (error) {status.textContent = error.message || '连接设置无法保存。';}
  };
  label.append(input); details.append(summary, label, note, save, status); body.append(details);
  return {dispose() {if (disposed) return; disposed = true; save.onclick = null; details.remove();}};
}
