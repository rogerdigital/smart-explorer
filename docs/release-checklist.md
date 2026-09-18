# Release Checklist

Record results against the exact candidate commit and asset hashes. The 1.0.0 acceptance evidence is recorded in the [evidence report](verification/1.0.0-readiness.md). A mandatory FAIL or BLOCKED row prevents release promotion. Automated tests, emulation, and API typings do not replace native runtime acceptance.

## Pre-release

- [ ] `npm run verify` passes (lint, production build, Jest, release-validator/workflow tests, fixture safety tests).
- [ ] Record candidate commit, OS/app versions, and SHA-256 of `main.js`, `manifest.json`, and `styles.css`; map every acceptance result to those assets.
- [ ] Draft release notes describe actual behavior and tested compatibility; identify unresolved gates.
- [ ] Confirm no network requests; inspect relevant APIs with `rg -n 'fetch|XMLHttpRequest|requestUrl' src/` and review the results.
- [ ] Confirm write scope: explicit note/folder creation, file/folder rename through FileManager, configured trash, and local plugin settings/manual order including rename path maintenance while enabled.
- [ ] Basic native smoke checks pass: load without console errors; tree/list browsing; sort/group/filter; create in the expected folder; collapse/reveal; settings persistence; vault create/delete/rename/modify updates.

## Mandatory 1.0 acceptance

Complete the matrix below before the 1.0 metadata bump. For later releases, select runtime checks according to changed behavior; documentation-only patches do not require rerunning this entire matrix. Preserve previous evidence and explain which checks apply.

- [ ] Rename files and folders inline with Obsidian's automatic link updates both enabled and disabled. Check wiki links, Markdown links, and embeds against native preference behavior; restore the preference.
- [ ] Verify invalid names, collisions, fixed file extensions, cancellation, Unicode/case-only names, missing targets, and surfaced rename/save errors. Verify trash follows host settings and cancellation leaves content intact.
- [ ] Reorder, then rename/create/delete, then Undo and drag again. Confirm all current files remain sortable, including after clearing filters/hidden extensions. Undo reverses ordering only.
- [ ] Close every explorer pane with the plugin enabled, rename an ordered file and folder in the native explorer, reopen and verify positions. Repeat reload and two-pane cases without duplicate persistence.
- [ ] Upgrade separately from installed 0.5.4 and 0.6.1 assets with captured settings and nonalphabetical order. Replace only assets, retain `data.json`, and verify preferences, rename/reorder, and reload.
- [ ] Fresh install with no `data.json` loads defaults and completes basic smoke checks.
- [ ] Run smoke checks on Obsidian 1.7.2 and the current stable app; record actual versions. Record which desktop operating systems were tested.
- [ ] Test actual iOS and Android devices: tree/list, touch controls, long-press/menu/drag versus scrolling, scroll during reorder, Undo, editing/cancel/collision, orientation/safe areas, persistence, and trash. Missing devices are BLOCKED.
- [ ] Verify narrow and wide panes in light/dark themes, distinguishable duplicate basenames, selection/focus visibility, filters, and active-file highlighting without unexpected reveal.
- [ ] Keyboard-only checks pass: one Tab entry, arrows/Home/End, folder expansion, Enter/Space, search/Escape, Alt+Arrow reorder, and Undo.
- [ ] Separately record real VoiceOver announcements for name, role, expanded state, position, and reorder result.
- [ ] Run the protected 5,000-file fixture in a real Obsidian test vault:
  - [ ] Create with `node scripts/prepare-large-vault-fixture.mjs --vault <test-vault> --files 5000` and record baseline vault size/environment. Confirm `app.vault.getFiles()` indexes exactly 5,000 files beneath the visible `smart-explorer-large-vault-fixture/` folder before measuring; 5,000 files on disk alone do not establish a valid runtime fixture.
  - [ ] Record three cold index runs and median; median is below 1,000ms without metadata-cache reads.
  - [ ] Initial flat list is usable within 500ms, with fewer than 60 file rows plus at most one pinned active row at the recorded viewport.
  - [ ] Scrolling keeps bounded rows without missing/duplicate rows or broken active descendants; closed tree branches mount no file descendants.
  - [ ] Manual drag reaches and saves the intended position through scrolling without full-row geometry measurement on every pointer move.
  - [ ] Record large expanded-folder and expand-all responsiveness/node counts without freeze or crash. Tree lazy mounting does not establish tree virtualization.
  - [ ] Remove with `node scripts/prepare-large-vault-fixture.mjs --vault <test-vault> --remove`; confirm unrelated content is untouched.
- [ ] Restore acceptance settings/theme/test files and remove instrumentation. Evidence records observed outcomes, screenshots/timings where relevant, and all remaining blockers.

## Release metadata and publication

- [ ] All mandatory acceptance rows PASS; reliability changes are included in the candidate.
- [ ] Bump using `npm version <version> --no-git-tag-version`; inspect `package.json`, `package-lock.json`, `manifest.json`, and `versions.json` for matching versions and verified minimum app version.
- [ ] Finalize current-version documentation and release notes.
- [ ] Run `npm run verify`, `node scripts/validate-release.mjs <version>`, and `git diff --check`; record final asset hashes.
- [ ] Release PR is merged and CI `verify` passes on its commit; publication is explicitly authorized.
- [ ] Confirm the version tag does not already exist locally/remotely. Create `git tag <version>` on the verified merged commit and push with `git push origin <version>`; use no `v` prefix and never move a released tag.
- [ ] Confirm the tag's release workflow succeeds and creates the GitHub Release. Do not run `gh release create` manually.
- [ ] Confirm `main.js`, `manifest.json`, and `styles.css` are attached and downloadable.

## Post-release

- [ ] Download the three release assets into a new temporary directory; validate version/minimum app version, hashes, and workflow commit.
- [ ] Install those downloaded assets into a clean test vault and verify browse/search/create/rename/link-update/manual-order/reload. Local build checks do not substitute for artifact installation.
- [ ] Record release URL, tag commit, workflow result, asset verification, and installation observations through a follow-up documentation PR; do not amend the released tag.
