# Official application presentation convention

Keep a small immutable module in each application's own repository:

```js
export const PRODUCT = Object.freeze({
  name: '完整中文产品名称',
  englishName: 'English Product Name',
  launcherName: '简短入口名称',
});
```

Use a product-specific export (`HUB_PRODUCT`, `POLISHER_PRODUCT`). Panel/header
names and accessible labels use `name`; short orb labels use `launcherName`;
English logs/descriptions use `englishName`. Static manifest display fields may
mirror these values only with a build-time equality check, as Polisher does.
Page-specific prose remains local. This is a coding convention, not a branding
framework or runtime theme API.

Never derive or rename protocol identity from display names. Keep extension IDs,
`miemie.*`, `__MieMieHub`, manifest/API/protocol fields and existing storage keys
stable. Historical strings in published artifacts and compatibility detectors
must remain intact.

A native launcher is an application-owned presentation component. Reuse it in
Standalone (calls the application's own Surface adapter) and opt-in Hub Shortcut
(calls the supplied `open`). Neither mount creates an application instance.
