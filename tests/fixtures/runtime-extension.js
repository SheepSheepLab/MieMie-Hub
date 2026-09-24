// Test-only runtime probe. Never imported by the product or bundle declaration.
export function createRuntimeFixture({id = 'test.runtime', name = 'Runtime fixture', message = 'Fixture message', events = []} = {}) {
  return {
    manifest: {schemaVersion: 1, apiVersion: 1, id, name, version: '1.0.0', contributes: {launcher: {title: name}}},
    events,
    factory(api) {
      events.push('factory');
      api.onCleanup(() => events.push('cleanup'));
      return {
        activate() {events.push('activate');},
        open() {events.push('open'); return api.showMessage(message);},
        deactivate() {events.push('deactivate');},
      };
    },
  };
}
