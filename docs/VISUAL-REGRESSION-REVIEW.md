# Visual regression review — 2026-09-28

Follow-up: the historical splash and native-orb behavior were corrected again after video review; see [HISTORICAL-MOTION-REVIEW.md](HISTORICAL-MOTION-REVIEW.md). The original findings below document the preceding review, not the final animation behavior.

Scope: fix the reported Tavern regressions only. No Registry, OAuth, Package validation, public Extension/Shortcut contract, classification, or protocol identity changes. No commit, push, release, or version bump.

## Findings and corrections

1. **Blur root cause:** the Honeycomb backdrop belonged to `#miemie-hub-shell` (z-index 2147483400), while Polisher's external presentation root was below it (2147483000). The backdrop sampled the already-rendered Polisher panel. Raising only the panel would not escape its ancestor stacking context. The Surface controller now temporarily raises the explicitly attached panel's ancestry above the backdrop using `--mie-z-surface`. It preserves scoped Extension CSS and original DOM ownership, restores inline styles on close/revoke/dispose, and never scans unrelated UI. No ancestor `filter: blur()` is introduced. System surfaces remain in the clear layer already owned by the shell.
2. **Scroll semantics:** entering the menu from `closed` uses a fresh centered launcher layout. Returning from an open Surface restores its captured scroll and does not reset the launcher. In browser review, the Surface round trip retained scrollTop 1152; full reopen returned to scrollTop 576 and Hub center Y 360 in a 720px viewport.
3. **Standalone geometry:** the native Polisher controller uses current orb rect, dock side, visual viewport, safe-area margins and bounded panel dimensions. Right dock chooses the orb's left; left dock chooses its right; insufficient space clamps to the safe viewport. Legacy right/bottom anchors are reset. Hub and Shortcut continue to use Hub Surface geometry. Mouse drag was checked in the browser; unit tests cover mouse/touch, persistence, both sides and resize.
4. **Historical brand animation:** inspected Hub `1d4bd9b:src/legacy-animations.inc.js`. Restored its 148px center artwork, short 16% hold, then shrink/translate into `[data-tool-icon]`, using the original 760ms curve through motion tokens. It follows the Surface morph. Header art is hidden during the handoff to avoid duplicate artwork. The old whole-panel blur splash is not restored. Timeline and Polisher use the same historical visual intent; system surfaces receive no added hero. Resize/dispose cancels and cleans up. Reduced motion skips the flight. Closing still morphs back to the opening origin.
5. **Shortcut setting:** a native checkbox with `role=switch`, explicit `aria-checked`, a styled track and thumb, and a 44px hit area. OFF is dark/left; ON is accent/right with glow. Motion uses the existing 160ms token. Focus, hover, press and disabled states are defined. Space uses native checkbox behavior; Enter activates it explicitly. Refresh preserves keyboard focus. Checked state requires both preference and mounted presentation. Failed/detached mounts dispose, reset/save OFF, and report an error without affecting the business instance.
6. **System icon artwork:** only `.mm-center` and `.mm-settings` glyphs use `clamp(44px,9vw,56px)`. Cell size, layout, extension artwork and `hubScale` are unchanged.
7. **Installed actions:** retain the existing explicit auto-fit grid; children now have `min-width:0`, bounded width and wrapping text. At 390px browser width, the Polisher card had clientWidth = scrollWidth = 290px, with controls arranged in rows and no horizontal overflow.

## Files changed in this round

Hub:
- `src/surface-controller.js`, `src/surface-motion.js`
- `src/shortcut-launchers.js`, `src/extension-center.js`
- `assets/theme.css`, `assets/launcher.css`, `assets/hub-panels.css`
- `tests/core-panels.test.mjs`, `tests/shortcut-launchers.test.mjs`, `tests/extension-center.test.mjs`
- `tests/integration/artifacts.lock.json`
- `tools/ui-review.mjs`, `tests/browser-final-ui/index.html`
- this report; local build output

Actual Polisher repository: `MieMie-Polisher` (separate repository)
- `native-launcher.js`, `assets/native-launcher.css`, `tests/native-launcher.test.mjs`
- local build output

Existing changes from earlier rounds are preserved, including previously removed legacy files; this round does not re-delete or otherwise rewrite them.

## Validation

- Hub full suite: **292 passed**.
- Polisher full suite: **34 passed**.
- Version/hash-locked actual Hub + Polisher artifacts: **30 integration checks passed**.
- Actual package install/update/uninstall ecosystem: **15 checks passed**.
- Both builds and syntax checks passed; both repositories `git diff --check` clean.
- New regressions cover full reopen vs Surface return, external stacking chain restoration, historical header landing, resize cancellation, shortcut mount rollback, touch activation and disabled behavior, plus native left/right geometry and viewport bounds.
- Browser review uses the actual built scripts in a development-only simulated Tavern host, with mock catalog/auth and no production writes. Checked clear Timeline, Settings, Extension Center, Polisher through Honeycomb and Shortcut; full reopen centering; native orb drag and left/right panel geometry; 390px standalone bounds and Installed layout; actual Space/Enter switch behavior and retained focus.
- Browser evidence: `build/visual-regression-review/` (clear Hub Polisher, both standalone dock sides, mobile switch ON/OFF).

## Local review

The running combined review is `http://127.0.0.1:5174/`. Use its Hub / standalone links to compare the real builds. It does not use a second UI implementation.

Restart from the Hub directory:

```sh
node tools/ui-review.mjs --port=5174 --polisher=/path/to/MieMie-Polisher/build/miemie-polisher.js
```

For actual Tavern import, use the newly built `MieMie-Hub-0.7.0.json` and `MieMie-Polisher-Extension-1.1.4.json` from their respective build directories. These are local review builds, not published releases.

Remaining user review: actual Tavern/mobile Safari/WebView compositing and frame pacing; preferred feel of the morph-to-header handoff and reverse morph; touch dock and keyboard/rotation behavior with the real host. Browser screenshots and DOM tests do not establish physical-device animation smoothness.

READY FOR VISUAL / INTEGRATION REVIEW
