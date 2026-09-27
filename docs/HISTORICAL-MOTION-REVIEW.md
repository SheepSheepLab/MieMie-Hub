# Historical orb motion follow-up — 2026-09-28

This supersedes the animation/Shortcut positioning notes in the preceding visual regression report. No release, commit, push, version change or public API change.

## Reference and correction

The complete old implementation was available locally at `1d4bd9b`: `src/hub-ui.js`, `src/legacy-animations.inc.js`, and `assets/legacy-menu.css`. The supplied 21-second recording was also inspected. GitHub fallback was unnecessary.

The preceding restoration started the large icon only after the window flight and omitted the blur veil. That changed the historical visual sequence. The corrected sequence is:

1. Prepare the 148px clear center artwork and temporary 14px backdrop-blur veil **before the first window animation frame**; hide the real header artwork.
2. Expand the panel from the current launcher rect with the splash already inside it.
3. Use the historical 760ms curve and 16% initial hold to land the artwork in the actual header rect while fading the veil away.
4. Remove the temporary overlay and restore the real header artwork. Panel content is then fully clear.
5. Return/close morphs the panel back into its own current origin. Resize, revoke, dispose and reduced motion retain safe completion and cleanup.

The veil is a temporary sibling above panel content, with the clear artwork above it. It does not apply `filter:blur()` to an ancestor of the whole application. System surfaces do not gain a brand splash.

## Native orb behavior

Standalone Polisher and Hub Shortcut now share the same spatial behavior: open beside the orb, follow it while dragging, and close into that orb. This intentionally replaces the earlier centered Shortcut positioning, following the latest user correction. Honeycomb-opened panels retain Hub's centered layout and scroll restoration.

- Standalone uses the existing native controller and one frame-batched geometry update per drag frame.
- Hub Shortcut keeps the existing Hub Surface lifecycle. Its explicit origin element supplies current geometry; a scoped observer watches only that element's style/class changes and batches repositioning. No document scan or idle animation loop is added.
- The explicit Shortcut orb remains above its panel so it is draggable even in a narrow viewport. Original layer styles and observer/frame resources are restored on close/revoke/dispose.
- Position persistence and the same single business instance remain intact. No Shortcut contract or Extension API change is required.

## Changed sources and tests in this follow-up

Hub: `src/surface-motion.js`, `src/surface-controller.js`, `src/hub-ui.js`, `assets/theme.css`, `tests/surface-splash.test.mjs`, `tests/core-panels.test.mjs`, artifact hash lock, and review documentation.

Polisher: `native-launcher.js`, `assets/native-launcher.css`, `tests/native-launcher.test.mjs`, and local build outputs in the actual Polisher repository.

## Validation

- Hub full suite: **295 passed**; Polisher full suite: **37 passed**.
- Actual artifact integration: **30 passed**; install/update/uninstall ecosystem: **15 passed**.
- Both builds, source/build syntax checks and both `git diff --check` checks passed.
- Added coverage: splash exists before morph completes, historical blur/hold/landing, resize/reduced-motion cleanup, mouse/touch panel follow, Shortcut follow and observer/layer cleanup.
- Real-build browser review at `http://127.0.0.1:5174/`: observed Timeline and Polisher initial big artwork with blurred content, clear content after landing, Shortcut and Standalone orb drag across dock sides with panel following, and Return/Collapse to the moved orb with no remaining splash/face.
- Screenshots: `build/historical-motion-review/`. These capture real compiled UI in a mock Tavern host, not a separate preview implementation.

Actual Tavern mobile Safari/WebView compositing and perceived frame pacing still need user visual review. Automated timing and screenshots cannot establish physical-device smoothness.

READY FOR VISUAL / INTEGRATION REVIEW


## Persistent native orb correction (03:12 recording)

The native orb must remain visible during the entire opening/closing flight. The earlier implementation temporarily hid it and substituted stretched icon artwork, borrowing Honeycomb's icon-to-window semantics. Removed native visibility toggling and that replacement face. Shortcut active feedback no longer hides Polisher's orb. Only the panel moves/scales/fades out from or back behind the persistent orb; historical header splash is retained. Hub Honeycomb's opaque icon morph is unchanged.

Validation: Hub 296 tests, Polisher 38 tests, artifact integration 30 checks and ecosystem 15 checks passed; builds, syntax and diff checks passed. New tests hold animations in progress and assert orb visibility during opening and closing, zero replacement faces, cleanup, and unchanged Honeycomb endpoint opacity. Real compiled Standalone and Hub Shortcut UI both observed with visible original orb in opening/closing states. Screenshots: `build/historical-motion-review/orb-visible-opening.png` and `orb-visible-closing.png`.

No commit, push or release. Physical Tavern frame pacing remains for user review.

## Standalone narrow-window regression (03:26 recording)

Reproduced in the existing Safari/Tavern page: after narrowing the open standalone panel to 390px, its computed height became **2px**, while `hidden=false`, `data-surface-state=open`, opacity 1 and transform none. The legacy `max-height:calc(100% - 52px)` constraint remained active. Native geometry passed camel-case `maxHeight` to `CSSStyleDeclaration.setProperty`, which silently ignores that property name. Hub geometry already used valid CSS names, explaining why Honeycomb and Shortcut entries were unaffected.

Fixed only the native geometry override to use `max-height`, with the same pixel height and important priority as the other viewport constraints. Added native geometry and complete-built-artifact regressions asserting the actual CSS property value through repeated wide/narrow resizes, retained open state and bounded width.

Validation: Polisher **39/39**, Hub **296/296**, artifact integration **30/30**, ecosystem **15/15**; both builds, syntax and diff checks passed. Safari 26.6 real-build review in the mock host: open at 1200×720, narrow to 390×720 then 320×720, expand to 1200×720 and close successfully. Panel and persistent orb remained visible. Chromium fixture also passed, but did not reproduce the original Safari collapse. Screenshot: `build/historical-motion-review/standalone-safari-narrow-fixed.png`.

The user's installed Tavern script was inspected but not replaced. Reimport the updated Polisher 1.1.4 JSON to verify the fix in that host. No Hub UI/animation changes, commit, push or release.

## Entrance-based Native Floating Presentation consolidation

External native orbs select the application's own presentation regardless of Hub presence. Polisher's `native-floating-presentation.js` is now the single implementation of beside-orb geometry, viewport clamping, native open/close keyframes, motion tokens, first-frame blurred splash, header landing and cancellation. `native-launcher.js` owns the shared orb/drag/dock and delegates follow updates to that presentation. Standalone wraps it with its existing UI lifecycle. Hub Shortcut supplies the same object through the optional mounted handle `presentation` capability.

Hub Surface Controller retains serialization, single instance, origin/return state, hidden/inert/focus, stacking and cleanup. It selects native place/run/cancel/release only for a Shortcut entrance that supplied the capability. Honeycomb retains Hub Surface Motion. Hub does not also position or animate the native panel, or install its fallback follow observer. Legacy providers without the optional presentation remain compatible. Missing/disposed origins use existing snapshot/fade fallback. Provider callbacks receive only the Extension's own panel and opening boolean, with no `this` receiver or internal state.

Tests: Hub **297/297**, Polisher **42/42**, artifact integration **30/30**, ecosystem **16/16**, builds/syntax/diff checks passed. New coverage compares native keyframes/options/geometry in both modes including reduced motion, drag and narrow resize; exercises disposal without hiding Hub-owned panels; verifies callback isolation, repeated entrance retention, Honeycomb routing, missing native origins and cancellation of a nonsettling provider. Complete built artifacts independently compare identical Shortcut/Standalone motion and widths 1200/390/320 through Hub stop/restart.

Actual compiled UI browser review: Shortcut and Standalone both open with persistent orb, historical splash and beside-orb panel; at 390×780 both resolve to left/top 10px, width 370px, height/max-height 760px. Close succeeds. Screenshots: `build/historical-motion-review/unified-shortcut.png` and `unified-standalone.png`. Local fixture uses mock host/data; physical Tavern Safari/WebView frame pacing still needs user review. Both Hub and Polisher local import files must be updated together to exercise delegation. No commit, push or release.

## Native provider failure hardening

Hub-only change: a provider `place()` exception now reports, cancels/releases that
presentation and falls through to existing Hub geometry. A thrown/rejected or
5000ms-pending `run()` is reported and quarantined for that Surface; after cleanup
and restoring the panel's pre-call inline style, existing Hub Surface Motion
finishes the requested endpoint. No new animation implementation or Polisher
Native Motion changes. Watchdog cleanup covers success, failure, resize, revoke
and dispose. Late Promise settlement cannot trigger a second Hub transition.
Cleanup/reporting exceptions and nonsettling cleanup Promises cannot block Hub's
navigation queue. Provider-owned arbitrary DOM/timers remain the provider's
cleanup responsibility; same-thread synchronous infinite loops cannot be
preempted by a JavaScript timeout.

New deterministic regression tests advance the actual 5000ms watchdog explicitly,
covering place/open/resize failure, synchronous run throws, Promise rejection,
opening/closing timeout, queued Surface switching, cleanup failures/hangs,
late results, resize/revoke/dispose in both directions, reduced motion and the
successful native path. Healthy native motion remains delegated unchanged.

Hardening validation: **19** new regression cases; Hub **316/316**, unchanged
Polisher **42/42**, locked-artifact integration **30/30**, ecosystem **16/16**
passed. Hub build, syntax and `git diff --check` passed. The existing Polisher
artifact hash is unchanged and still matches the integration lock. No Commit,
Push or Release; this follow-up requires only the rebuilt Hub import.
