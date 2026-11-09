import assert from 'node:assert/strict';

// jsdom has no modal top layer. The production build uses the native dialog.
export function openInstalledDetails(host,id) {
  const prototype=host.HTMLDialogElement.prototype;
  prototype.showModal??=function(){this.open=true;};
  prototype.close??=function(){this.open=false;};
  const button=host.document.querySelector(`[data-extension-id="${id}"] > .mm-catalog-row-open`);
  assert.ok(button,'Installed row: '+id);
  button.click();
  return host.document.querySelector('.mm-description-dialog[open]');
}
