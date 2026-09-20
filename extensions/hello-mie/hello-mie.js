// The Manifest is a separate file. No host globals, DOM, network or storage.
export function createHelloMie(api) {
  return {
    activate() {},
    open() {
      api.showMessage('咩咩Hub扩展系统运行正常');
    },
    deactivate() {},
  };
}
