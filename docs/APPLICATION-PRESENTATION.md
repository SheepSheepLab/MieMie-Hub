# Application Presentation & Shortcut Launcher · 2026-09-27

Status: READY FOR VISUAL / INTEGRATION REVIEW. This supersedes the previous
Architecture Freeze assessment for this working tree. No commit, push, release,
version bump, deployment or production database change was performed.
Hub 0.7.0 / Polisher 1.1.4 / Registry 0.4.0 remain development builds for review.

## Architecture and public contract

- Runtime adds optional API v1 `registerShortcutLauncher({mount})` and the public
  boolean `shortcutLauncherAvailable`. It still owns one factory/session/panel.
  Capability registration requires an attached main panel and manifest launcher.
- `src/shortcut-launchers.js` owns private mounting/persistence wiring, not app
  appearance. `mount` synchronously receives frozen `{open}` and returns explicit
  `getOrigin`, `dispose`, optional `setActive` and `highlight`. No Runtime record,
  trusted classification, session, controller or Registry identity is exposed.
- Native presentation owns all DOM, drag, dock and feedback. Hub never discovers
  third-party panels or rewrites their handlers. Old extensions remain unchanged
  and do not show a switch. No Polisher ID branch exists in generic capability code.
- Installed “显示悬浮球” is default off. Enabling it adds an external entry; the
  Honeycomb entry is always retained. Both call the same Runtime open/Surface.
  Repeated opening focuses the existing surface and retains its opening origin.
- Honeycomb origin retains icon identity, current rect/snapshot and scroll.
  Shortcut origin privately captures the explicitly supplied element, current
  rect/snapshot, feedback and prior Hub visibility/scroll. Close returns to that
  entrance. Explicit Hub open remains separate from return-to-origin navigation.
- Current rect wins; missing/detached origin falls back to viewport-clamped
  snapshot, then fade/scale. Rotation cancels old flights and completes state.
  Disable/dispose cancels flights and removes transient faces/pointer blocking.

## Preference and lifecycle

`miemie_hub_shortcuts_v1` stores local booleans per Extension ID. It is never sent
to Registry. Disable removes native UI immediately but keeps preference. Enable,
source update and Hub reload restore it. Source withdrawal during replacement
preserves it; confirmed physical package uninstall or explicit Runtime uninstall
clears it. Missing capabilities ignore stale preferences safely. Panel close does
not deactivate, delete settings, cancel business data or create another instance.

## Polisher reference implementation

`native-launcher.js` + `assets/native-launcher.css` provide one native component:
64px orb, mouse/touch Pointer Events, drag threshold, prevention of drag clicks,
left/right Dock, safe-area/visual-viewport bounds, hover/press/focus feedback,
position persistence, Orb ↔ Panel transition, reduced motion and teardown.
Drag uses cached geometry and transform instead of repeated layout measurements.

Standalone mounts this component automatically and owns show/close animation.
Hub registers the same component as optional Shortcut; its supplied `open` enters
Hub Surface using the native origin. Polisher has one active business instance,
one fetch hook set, one panel and shared config/current state. Existing serialized
mode handoff still preserves memory-only keys and unsaved form state. Hub removal
restores Standalone; Hub return recollects it without overlapping instances.

`miemie_polisher_dock_v1` is shared by the two native presentation modes and is
independent of `meeme_timeline_dock_v1`. There was no previous native standalone
Dock persistence key to migrate. Historical Polisher business keys remain intact.

`POLISHER_PRODUCT` centralizes name / englishName / launcherName. Repeated panel,
header, orb, aria and alt labels consume it. Build checks mirrored manifest labels.
Protocol identity `miemie.polisher`, script ID, API names and storage keys remain
stable. See [PRODUCT-IDENTITY.md](PRODUCT-IDENTITY.md) for the official convention.

## Responsive presentation

Wide Catalog composition remains canonical. Explicit grid areas own heading,
assurance/badge, description, actions and footer. Title/version stay adjacent.
Footer groups navigation links separately from source/type/submitter. Installed
and submission actions use predictable grids rather than accidental wrapping.

- Content container >760px: canonical wide footer/assurance layout.
- Content container 561–760px: grouped metadata and links compress deliberately.
- Content container ≤560px: explicit vertical card areas and two-column link group.
- Center panel ≤600px: compact header/account and 52px left sidebar.
- clamp bounds keep main title ≥15px and padding ≥12px. Interactive links and
  controls retain roughly 44px targets. Installed status remains noninteractive.
- Container-query fallback supplies a conservative single-column layout for older
  WebViews. No page ScaleBox or global transform shrinks text/touch targets.

Browser DOM geometry: 320, 375, 390, 430, 768 and 1280px had no horizontal overflow
in visible header/search/card/main regions. At 320px, authenticated account,
Installed and submission form also passed. Local Catalog/OAuth data are fixtures;
UI code is the actual Hub build. These are browser checks, not physical-phone FPS
measurements or a new production Discord login test.

## Product classification and installation boundary

Three types and three distributions are unchanged. Type is a submitter declaration;
GitHub Language is never an input. Standalone must external_release, Web must
open_url. Discord cannot managed_install. Tavern external_release is allowed even
without a standard Package and never produces Hub Install UI.

Request parsing and governance independently reject illegal combinations.
Registry Catalog inspection now downloads bounded actual package bytes and checks
structure/build identity/hash using the same `package-validation.js` as the safe
relay. Metadata alone cannot mark an arbitrary payload installable. No code is
executed. Existing cache/refresh budgets and allowlisted transport remain; an
inspection can now consume an additional package download of at most 16 MiB.

Hub still re-inspects at install time, rejects changed Catalog extension identity,
then checks locked Release/metadata/content hashes, package structure and API
compatibility before host writes. Cached installable data is not installation
authority. UI states “detected Hub Package” or “no Hub Package detected”; it does
not claim a non-package repository is not a Tavern extension. Machine compatibility
is not a safety audit. Official/Community and governance privileges are unchanged.

## Validation

| Suite | Result |
| --- | --- |
| Hub full | 286 / 286 |
| Polisher full | 31 / 31 |
| Registry full | 173 / 173 |
| Built Hub + Polisher integration | 30 / 30 |
| Install / update / uninstall ecosystem | 15 / 15 |
| Admin HTTP / DOM | 11 / 11 |
| Hub ↔ Registry contract | 13 / 13 |
| Registry inspector against actual built Polisher package | PASS |
| All three builds / syntax / git diff --check | PASS |

Integration locks exact generated artifact hashes. HTTP tests use isolated local
services, mock Discord/GitHub and temporary SQLite, never production credentials.
Coverage includes default-off/opt-in, generic third-party capability, dual entries,
first-origin retention, original scroll, missing origin, interrupted motion,
disable/enable, physical update/uninstall, reload, single instance, native
mouse/touch/dock, reduced motion, standalone recovery and package mutation denial.

## Changed files in this increment

Hub:
- src/shortcut-launchers.js (new), extension-runtime.js, bootstrap.js, hub-ui.js
- src/surface-controller.js, surface-motion.js, extension-center.js
- assets/hub-panels.css; tools/build.mjs
- tests/shortcut-launchers.test.mjs (new), core-panels.test.mjs,
  extension-center.test.mjs, runtime.test.mjs, architecture.test.mjs,
  integration/host-fixture.js, integration/artifacts.lock.json, ecosystem/run.mjs
- docs/EXTENSION-API.md, PRODUCT-IDENTITY.md (new), ARCHITECTURE-FREEZE.md,
  APPLICATION-PRESENTATION.md (new)

Polisher (current actual 1.1.4 repository; the old workspace mirror was not edited):
- product-identity.js (new), native-launcher.js (new), assets/native-launcher.css (new)
- launcher-adapter.js, entry.js, legacy-tool.js, resources.js, tools/build.mjs
- tests/native-launcher.test.mjs (new), launcher-adapter.test.mjs,
  compatibility.test.mjs; docs/APPLICATION-PRESENTATION.md (new)

Registry:
- src/validation.js, governance.js, remote.js, github-relay.js,
  package-validation.js (new)
- tests/remote.test.mjs, product-boundary.test.mjs (new); docs/API.md

Pre-existing Final UI/Registry working-tree changes were retained. Build products
and local review screenshots/logs are generated artifacts, not new production
source implementations.

## Remaining acceptance

No known architectural blocker to the next Release Hardening phase was found.
First validate on actual Tavern: enable the Polisher switch, compare both entrances
and their return targets, drag/dock on touch, inspect native Standalone morph with
Hub disabled, rotate during flight, and review compact card typography. Multiple
orbs can overlap; each has its own Dock and can be moved. Automatic avoidance is
intentionally outside this task. Real Safari/WebView frame pacing, safe-area and
visual motion quality remain device acceptance items. Do not release before this
visual/integration review is accepted.
