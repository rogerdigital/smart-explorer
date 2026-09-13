# Smart Explorer 1.0 Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Independent verification may use superpowers:subagent-driven-development; do not edit the shared view concurrently.

**Goal:** Release the existing explorer feature set as 1.0.0 after correcting rename/order reliability, proving upgrade and runtime compatibility, and aligning release documentation with shipped behavior.

**Architecture:** Preserve FileIndex as the view's file-data source and keep the current renderers and settings schema. Move shared manual-order rename maintenance to plugin lifetime, keep view-specific selection and Undo state in the view, and use Obsidian FileManager for user-initiated rename. Reuse existing reconciliation, serialized settings saves, and release workflows.

**Tech Stack:** TypeScript, Obsidian API, Jest/ts-jest with Node and jsdom suites, esbuild, ESLint, Node release/fixture tests, GitHub Actions.

---


## Execution status — 2026-09-13

Implementation is complete. The user confirmed the previously reported mobile, Obsidian 1.7.2, VoiceOver, and full keyboard/drag acceptance items. Other release checks remain tracked separately. See [candidate evidence](../../verification/1.0.0-readiness.md) for exact runtime observations, asset hashes, cleanup, and remaining gates.

- Tasks 1–4: completed. Core changes share one tightly coupled commit (`164b501`) because plugin ownership, view history, and integration-harness changes must be tested together.
- Task 5: desktop rename/link/Undo/no-pane/reload, targeted native creation/keyboard, and real 5,000-file performance checks completed; full gestures/keyboard and VoiceOver subsequently confirmed by the user; remaining width/error cases are tracked in the evidence.
- Task 6: schema regression, actual 0.5.4 and 0.6.1 upgrades, and no-data loading completed. Mobile and minimum-version checks subsequently confirmed by the user; final downloaded-release installation remains pending.
- Task 7: documentation and draft notes completed; version remains 0.6.1.
- Tasks 8–9: not started; prerequisites are not satisfied. No publication authorization is inferred.
- Evidence-driven adjustment: hidden fixture content was invisible to Obsidian (0 indexed files). The generator now uses `smart-explorer-large-vault-fixture`, with the marker guard retained (`05a0214`). Do not reuse the former hidden path for future performance acceptance.
- Implementation and documentation are delivered together on `fix/1.0-order-reliability` for the user-requested PR, without release metadata changes.

## 1. Execution contract

This document is executable without the preceding conversation. The default execution scope is implementation, automated verification, available local acceptance, documentation, and a reviewable delivery. Writing this plan does not itself authorize executing it, merging PRs, or publishing a release. Once instructed to execute, proceed through the authorized scope without requesting routine implementation decisions. If merge/tag publication is also explicitly authorized, continue through the final publication phase after all gates pass.

Rules:

- Read repository `AGENTS.md` and `CLAUDE.md` before changes. Follow their current rules if paths or commands have changed.
- Work on a feature branch, never commit implementation directly to main. Preserve unrelated changes. Use a worktree if the checkout is occupied.
- Keep this plan's checkboxes current. Record observations in `docs/verification/1.0.0-readiness.md`; distinguish PASS, FAIL, and BLOCKED. An unchecked legacy plan is not evidence that code is absent.
- For each bug: add its regression, observe the relevant failure, implement the narrow fix, rerun focused tests, then run the complete gate at the integration boundary.
- Do not expand into tree manual ordering, grouped manual ordering, full-text search, previews, saved views, bulk moves, tags, localization, or a new persistence schema.
- Runtime acceptance must use the exact candidate commit/build. A jsdom pass, mobile emulation, a fixture-generation test, or an API typing check is not real-device acceptance.
- Missing hardware, app versions, credentials, or publication authority blocks only the dependent steps. Finish independent work and provide precise remaining actions. Never claim release readiness while a mandatory gate is BLOCKED.
- The supported guarantee covers renames while the plugin is enabled, including when every explorer pane is closed. Renames while the plugin is disabled or Obsidian is not running cannot reliably preserve path-based identity; document this limitation rather than inventing a content database.
- Commit messages, PRs, release notes, and repository documentation remain normal English engineering content without tool/model attribution.

### Delivery boundaries

| Delivery | Scope | Gate |
|---|---|---|
| PR A: Reliability | Tasks 1–4; no version bump | Regression tests, full verify, desktop rename/order smoke test |
| PR B: Acceptance and documentation | Tasks 5–7; no version bump | Evidence matrix and docs consistent with actual results |
| PR C: Release metadata | Task 8 | All mandatory acceptance gates PASS; version metadata validates |
| Publication | Task 9 | PR C merged, CI green, explicit publication authorization |

These are logical boundaries. Prepare A first; do not queue code changes on an unmerged main that lacks A. If PR operations are outside the execution request, deliver the same boundaries as local commits and report their status.

## 2. Verified planning baseline

Observed on 2026-09-12:

- Local HEAD: `d11a4d3dfd3100f317ba58d29bc1438cb0643118`; package/manifest version `0.6.1`; minimum app version `1.7.2`; mobile support declared.
- `npm run verify` passed: 29 Jest suites / 244 tests, 6 release tests, 7 fixture tests, lint and production build.
- GitHub latest release was `0.6.1`; its release workflow and main CI succeeded; no open PRs or issues were returned. Recheck at execution time.
- `renameItemToName` calls `vault.rename`, bypassing FileManager's link-maintenance contract.
- Reorder → rename → Undo was reproduced by invoking the actual methods with UI stubs: an old path returned to the order and the renamed file could no longer be dragged.
- Shared rename maintenance currently lives inside `SmartExplorerView.registerVaultEvents`, leaving a gap when no view exists.
- The August plan records some desktop visual acceptance, but does not contain a completed full mobile/VoiceOver/5,000-file evidence matrix.
- `AGENTS.md` and `CLAUDE.md` still state version `0.5.4`; privacy/write-scope text omits existing rename/trash behavior.

These observations are a starting point, not permission to skip fresh baseline checks.

## 3. File map

| File | Responsibility/change |
|---|---|
| `src/main.ts` | Register one plugin-lifetime rename listener; persist shared renamed paths through the existing queue |
| `src/explorer/SmartExplorerView.ts` | FileManager rename, view-local Undo path migration, complete Undo reconciliation; remove duplicate shared rename writes |
| `src/explorer/manualOrder.ts` | Reuse `renameManualOrderPaths` and `reconcileManualOrder`; no replacement algorithm |
| `src/explorer/__tests__/SmartExplorerView.test.ts` | Rename API contract and Undo structural-change regressions |
| `src/__tests__/main.test.ts` | Plugin lifetime, no-pane rename, subtree rename, save failure/recovery tests |
| `src/explorer/__tests__/SmartExplorerView.integration.test.ts` | Realistic multi-listener event harness; combined index/order/Undo/persistence checks |
| `src/settings/__tests__/settings-normalization.test.ts` | Explicit old-version settings and corrupt-data regression cases |
| `docs/verification/1.0.0-readiness.md` | Candidate-specific automated/runtime evidence and gate decision |
| `docs/release-notes/1.0.0.md` | User-facing release notes with supported scope and limitations |
| `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/release-checklist.md` | Correct product/write-scope/version/testing guidance |
| Existing July/August plan documents | Add concise status pointers; preserve historical instructions |
| `package.json`, `package-lock.json`, `manifest.json`, `versions.json` | Separate final version change |

Do not refactor the large view class or introduce a general event framework as part of these fixes.

## Task 1: Refresh baseline and establish evidence

- [x] Read the repository rules and inspect the branch/worktree.

```bash
git status --short
git branch --show-current
git log -1 --format='%H %s'
cat package.json manifest.json
```

- [x] Create branch `fix/1.0-order-reliability` from current main after fetching and inspecting divergence. Do not reset or overwrite existing changes. If this branch already exists, inspect and resume it rather than recreate it.
- [x] Run `npm ci` when dependencies are absent or the lockfile/environment changed, then `npm run verify`. Record exit codes and counts. A dependency/network failure is an environment blocker, not a regression result.
- [x] Create `docs/verification/1.0.0-readiness.md` with these sections: candidate commit and asset hashes; environment versions; automated checks; bug reproductions; desktop matrix; mobile matrix; compatibility; upgrade/install; performance; accessibility; outstanding blockers; final gate decision.
- [x] Use this row schema for all acceptance observations:

```markdown
| ID | Candidate | Environment | Action/input | Expected | Observed | Evidence | Status |
|---|---|---|---|---|---|---|---|
```

Record unavailable checks as BLOCKED with the specific missing device/version/access. Do not populate expected values into the observed column.

## Task 2: Preserve links during inline rename

**Files:** `src/explorer/SmartExplorerView.ts`, `src/explorer/__tests__/SmartExplorerView.test.ts`.

- [x] Add `TFile` to the existing test imports and add this regression in the existing mocked-Obsidian test file:

```ts
it("renames through FileManager so host link preferences are respected", async () => {
  const file = Object.assign(new TFile(), {
    path: "notes/old.md", basename: "old", extension: "md",
  });
  const view = Object.create(SmartExplorerView.prototype) as any;
  view.app = {
    vault: {
      getAbstractFileByPath: (path: string) => path === file.path ? file : null,
      rename: jest.fn(),
    },
    fileManager: { renameFile: jest.fn().mockResolvedValue(undefined) },
  };
  view.renderList = jest.fn();
  await view.renameItemToName("notes/old.md", "new");
  expect(view.app.fileManager.renameFile).toHaveBeenCalledWith(file, "notes/new.md");
  expect(view.app.vault.rename).not.toHaveBeenCalled();
  expect(view.selectedPath).toBe("notes/new.md");
});
```

- [x] Run `npm test -- --runInBand src/explorer/__tests__/SmartExplorerView.test.ts`; confirm the new test fails because FileManager was not called.
- [x] In `renameItemToName`, replace only the mutation call, retaining collision checks, extension preservation, success selection, and Notice error handling:

```ts
await this.app.fileManager.renameFile(file, nextPath);
```

- [x] Extend the regression table with folder rename (`old/x.md` remains under renamed folder), collision (neither API called), unchanged basename (no mutation), and rejected FileManager promise (Notice, no success selection). Use `TFolder` from the same mock for folder identity. A mock cannot establish that actual backlinks changed; reserve that assertion for Task 5.
- [x] Run the focused test file and `npm run build`. Commit as `fix: preserve internal links during explorer rename`.

## Task 3: Make shared rename maintenance independent of open panes

**Files:** `src/main.ts`, `src/explorer/SmartExplorerView.ts`, `src/__tests__/main.test.ts`, `src/explorer/__tests__/SmartExplorerView.integration.test.ts`.

### Ownership decision

The plugin owns exactly one transformation of `settings.manualOrder` per vault rename. Each view still updates its FileIndex, selected paths, expanded folders, reconcile flag, and its own Undo snapshots. The plugin listener must not synchronously render views before their indexes consume the same event. Reuse each view's existing scheduled rebuild.

- [x] Add `registerEvent() {}` to the mock Plugin classes used by tests that call `onload`. Provide `app.vault.on` in those test apps. Inspect all `onload` tests with `rg -n 'onload|registerEvent' src/__tests__ src/explorer/__tests__`.
- [x] In `main.test.ts`, add a callback-capture test with no leaves and saved order `['b.md', 'old/a.md', 'c.md']`. Call `onload`, emit rename with `{path:'new'}` and old path `old`, await `flushSettings`, and expect `['b.md','new/a.md','c.md']` in memory and the last `saveData` snapshot. Cover exact-file rename and unrelated-prefix `older/a.md` as separate cases. The current code must fail this no-pane test.

```ts
it("persists folder renames without an explorer pane", async () => {
  const plugin = new SmartExplorerPlugin({} as any, {} as any);
  const listeners: Record<string, (...args: any[]) => void> = {};
  (plugin as any).app = {
    vault: { on: (event: string, callback: (...args: any[]) => void) => {
      listeners[event] = callback;
      return { event, callback };
    } },
    workspace: { getLeavesOfType: () => [] },
  };
  plugin.loadData = jest.fn().mockResolvedValue({
    manualOrder: ["b.md", "old/a.md", "older/a.md", "c.md"],
  });
  plugin.saveData = jest.fn().mockResolvedValue(undefined);
  await plugin.onload();
  expect(listeners.rename).toBeDefined();
  listeners.rename!({ path: "new" }, "old");
  await plugin.flushSettings();
  expect(plugin.settings.manualOrder).toEqual([
    "b.md", "new/a.md", "older/a.md", "c.md",
  ]);
  expect(plugin.saveData).toHaveBeenLastCalledWith(expect.objectContaining({
    manualOrder: ["b.md", "new/a.md", "older/a.md", "c.md"],
  }));
});
```
- [x] Import `renameManualOrderPaths` in `src/main.ts`. After `await this.loadSettings()` and before view registration, add:

```ts
this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
  const order = this.settings.manualOrder;
  const nextOrder = renameManualOrderPaths(order, oldPath, file.path);
  if (nextOrder === order) return;
  this.settings.manualOrder = nextOrder;
  void this.saveSettingsWithNotice("Could not save manual order after rename");
}));
```

This intentionally uses the existing serialized immutable-snapshot save queue. An empty order stays empty. Do not introduce a separate timer, write directly through `saveData`, or infer file identity from content.

- [x] Replace the view's `updateManualOrderAfterRename` method with a view-local method and replace its two call sites in the rename listener:

```ts
private updateManualOrderUndoAfterRename(oldPath: string, newPath: string) {
  this.manualOrderUndoStack = this.manualOrderUndoStack.map((order) =>
    renameManualOrderPaths(order, oldPath, newPath),
  );
}
```

Delete the old shared mutation/save method. Move its shared-order tests to `main.test.ts`; retain view tests for history migration. Production views initialize their stack; bare test views must explicitly set `manualOrderUndoStack = []`.

- [x] Correct the integration harness: its current `vaultHandlers[name] = cb` overwrites multiple listeners. Store an array per event, append in `on`, and dispatch all listeners from an `emitVault` helper. Use the same event argument shape as the real API. Register plugin listeners by calling and awaiting `plugin.onload()` before registering view listeners. Update `makeHarness` to async and await it at every test call site. Remove test-only preloading that `onload` now handles.

```ts
const vaultHandlers = new Map<string, Array<(file: any, oldPath?: string) => void>>();
const onVault = (name: string, callback: (file: any, oldPath?: string) => void) => {
  const callbacks = vaultHandlers.get(name) ?? [];
  callbacks.push(callback);
  vaultHandlers.set(name, callbacks);
  return { name, callback };
};
const emitVault = (name: string, file: unknown, oldPath?: string) => {
  for (const callback of [...(vaultHandlers.get(name) ?? [])]) callback(file, oldPath);
};
```

Use `on: onVault` in the fake vault and replace direct `vaultHandlers.rename!(...)` calls with `emitVault('rename', ...)`. Where lifecycle cleanup is tested, implement fake `offref` and mock `registerEvent`/unload cleanup rather than claiming the no-op mock proves cleanup.

- [x] Add tests for zero views; one and two open views; folder subtree rename; an unrelated rename causing no save; failed save producing Notice followed by a successful later rename/save. Verify both views consume the event and their histories migrate without a second transformation of shared order. Event tests must update the fake vault map to match the event before emission.
- [x] Run `npm test -- --runInBand src/__tests__/main.test.ts src/explorer/__tests__/SmartExplorerView.test.ts src/explorer/__tests__/SmartExplorerView.integration.test.ts`, then `npm run build`. Commit as `fix: preserve manual order when explorer panes are closed`.

## Task 4: Reconcile Undo against current vault contents

**Files:** `src/explorer/SmartExplorerView.ts`, `src/explorer/__tests__/SmartExplorerView.test.ts`, `src/explorer/__tests__/SmartExplorerView.integration.test.ts`.

Contract: Undo reverts ordering, never file-system operations. Renamed paths retain their historical position. Deleted paths cannot return. New and hidden files remain in the complete order and remain draggable after filters are cleared. New paths append using the existing seed sort. An unchanged vault still gets the normal one-step order reversal.

- [x] Add table-driven regressions for these exact histories:

| Saved history / current order | Structural change | Expected after Undo |
|---|---|---|
| history `[a,b]`, current `[b,a]` | rename `a` to `renamed` | `[renamed,b]` |
| history `[a,b]`, current `[b,a]` | create `c` | `[a,b,c]` |
| history `[a,b,c]`, current `[b,a,c]` | delete `a` | `[b,c]` |
| history `[old/a,old/b,z]` | rename folder `old` to `new` | `[new/a,new/b,z]` |
| history `[a,b]`, current `[b,a]` | no structural change | `[a,b]` |

Use `.md` suffixes in fixtures. Build full FileRecord values (`path`, `basename`, `extension`, `parentPath`, `size`, `ctime`, `mtime`, `isMarkdown`). Set `view.query` to a complete manual query, `manualSeedSort` to `name-asc`, and `fileIndex.getAll` to the latest complete records. Stub rendering, save scheduling, and control updates only; do not stub the reconciliation method under test.

Add this concrete regression to the existing view test file and import `reorderManualOrder` from `../manualOrder`:

```ts
it("keeps a newly created file draggable after Undo", () => {
  const records = ["a.md", "b.md", "c.md"].map((path) => ({
    path, basename: path.slice(0, -3), extension: "md", parentPath: "",
    size: 0, ctime: 0, mtime: 0, isMarkdown: true,
  }));
  const view = Object.create(SmartExplorerView.prototype) as any;
  view.plugin = { settings: { manualOrder: ["b.md", "a.md", "c.md"] } };
  view.query = {
    sort: "manual", group: "none", searchText: "", extension: null,
    fileKind: "all", modifiedWithinDays: null,
  };
  view.manualSeedSort = "name-asc";
  view.manualOrderUndoStack = [["a.md", "b.md"]];
  view.manualOrderNeedsReconcile = false;
  view.fileIndex = { getAll: () => records };
  view.renderList = jest.fn();
  view.scheduleSaveOrder = jest.fn();
  view.updateManualOrderControls = jest.fn();
  view.undoManualReorder();
  expect(view.plugin.settings.manualOrder).toEqual(["a.md", "b.md", "c.md"]);
  expect(reorderManualOrder(
    view.plugin.settings.manualOrder, "c.md", 0, [{ id: "all", records }],
  )).toEqual(["c.md", "a.md", "b.md"]);
});
```

- [x] Confirm create → Undo fails on current code; rename history migration from Task 3 may already make the rename case pass. After each Undo, call the real `reorderManualOrder` with the resulting array and full visible section, and prove a newly created/renamed file can change position. Add hidden-extension and active-filter cases with the full index still supplied.
- [x] Replace `undoManualReorder` with:

```ts
private undoManualReorder() {
  if (this.query.sort !== "manual") return;
  const previousOrder = this.manualOrderUndoStack.pop();
  if (!previousOrder) return;
  this.plugin.settings.manualOrder = previousOrder;
  this.initializeManualOrder(this.fileIndex.getAll());
  this.manualOrderNeedsReconcile = false;
  this.renderList();
  this.scheduleSaveOrder();
  this.updateManualOrderControls();
}
```

`initializeManualOrder` already clears display filters for seed sorting, reconciles against the full index, and rebuilds the order index. Keep its behavior; the final scheduled save is necessary even when reconciliation returns the same reference.

- [x] Add an integration regression: actual reorder → actual vault rename event → advance the 300ms rebuild → Undo → drag renamed row → advance the 500ms save → await `flushSettings`. Assert the saved array is a unique permutation of current file paths and contains no old name. Repeat create/delete cases, and an Undo before the scheduled rebuild (the index is updated synchronously by the event).
- [x] Run the three focused files from Task 3 plus `src/explorer/__tests__/manualOrder.test.ts`. Run `npm run verify`. Record counts and candidate commit. Commit as `fix: reconcile manual order history with vault changes`.
- [x] Review PR A for ownership duplication, stale-index pruning, unhandled save failures, and unintended schema changes. Run the desktop rename/order smoke cases from Task 5 before declaring A ready. If publishing PRs is authorized, open PR A with regression details and actual validation results.

## Task 5: Desktop, accessibility, and performance acceptance

**Output:** `docs/verification/1.0.0-readiness.md`. No production change unless a concrete regression is found; each found regression gets a failing test where feasible and a focused fix.

- [x] Record OS, Obsidian app/installer version, theme, candidate commit, Node version, and SHA-256 of `main.js`, `manifest.json`, and `styles.css` (`shasum -a 256 main.js manifest.json styles.css`). Confirm `/Users/Roger/my-vault/.obsidian/plugins/smart-explorer` resolves to the candidate checkout before building. Do not silently replace an unrelated plugin installation.
- [x] Keep acceptance files within a uniquely named test subtree. Record its original nonexistence and created paths. Never bulk-delete existing vault content; remove only the files created by this run.
- [x] Create `se-1.0-acceptance/old/Target.md` and `se-1.0-acceptance/Links.md` with `[[old/Target]]`, `[Target](old/Target.md)`, and `![[old/Target]]`. With automatic link updates enabled, rename Target inline and then rename its parent folder. Inspect all three references and open their destinations. Repeat with automatic link updates disabled and verify native host preference behavior. Restore the original preference.
- [ ] Test create note/folder at root and selected folder; blank/invalid names; collision; Unicode names; fixed extension; cancel; missing target after external deletion; rejected rename/save surfaces a useful error. Verify delete uses the configured trash destination and cancellation leaves contents untouched.
- [ ] Reproduce every Task 4 history through the UI. Close every Smart Explorer leaf while leaving the plugin enabled, rename a manually ordered file in the native explorer, reopen and verify position. Repeat folder rename, reload, and two open panes. Verify repeated open/close does not duplicate reactions.
- [ ] At 300px and a wider pane, in light and dark themes, verify duplicate basenames show distinguishable paths, selected/focused rows are visible, filter controls remain usable, and switching active files highlights without unexpected scroll/reveal.
- [ ] Keyboard-only: one Tab stop enters the composite; arrows/Home/End navigate; left/right collapse/expand folders; Enter/Space activate; search and Escape work; Alt+Arrow reorder and Undo work. With VoiceOver, record announced name, role, expanded state, position, and reorder result. Keyboard tests and VoiceOver are separate rows.
- [x] Run the repository's protected fixture commands:

```bash
node scripts/prepare-large-vault-fixture.mjs --vault /Users/Roger/my-vault --files 5000
```

Measure three fresh `FileIndex.build()` operations in a real Obsidian session, not Node mocks; record all durations and median. Use the debugger or temporary local instrumentation around the actual build and render boundaries. Restore instrumentation before final verification. Record host/environment so timing is interpretable.

| Performance case | Pass criterion |
|---|---|
| Cold index, 5,000 fixture files plus recorded baseline vault | Median of three runs < 1,000ms; no metadata-cache reads |
| Initial flat list after indexing | Usable render < 500ms; fewer than 60 file rows plus at most one pinned active row at the measured viewport |
| Closed tree | No mounted file descendants under closed branches |
| Flat list scrolling | Bounded row nodes throughout; no missing/duplicate visible rows or broken active descendant |
| Manual drag | Drop reaches intended position, survives scroll and saves; no full-row geometry measurement on every pointer move |
| Large expanded folder and expand-all | Record node count and responsiveness; no freeze/crash; do not claim tree virtualization because only lazy mounting exists |

Use an additional dedicated flat-directory fixture only if the standard fixture does not exercise many siblings; create/remove it with the same ownership safeguards. Do not treat the fixture's own Node safety test as a runtime performance test.

- [x] Remove the standard fixture using its marker guard and verify unrelated files remain:

```bash
node scripts/prepare-large-vault-fixture.mjs --vault /Users/Roger/my-vault --remove
```

- [ ] Restore theme/settings/test files changed for acceptance. Record pass/fail per scenario with actual timings or screenshots. If a timing gate fails, profile the measured path and fix that bottleneck; do not implement tree virtualization speculatively.

## Task 6: Compatibility, real mobile devices, and upgrade safety

**Files:** `src/settings/__tests__/settings-normalization.test.ts`, `docs/verification/1.0.0-readiness.md`.

- [x] Add explicit normalization regression fixtures for the existing schema:

```ts
const saved = {
  defaultSort: "manual", defaultGroup: "folder", lastViewMode: "list",
  hiddenExtensions: ["png"], manualOrder: ["b.md", "a.md"],
};
expect(normalizeSettings(saved)).toEqual(saved);
expect(normalizeSettings({ ...saved, lastViewMode: undefined }).lastViewMode).toBe("tree");
expect(normalizeSettings({ ...saved, manualOrder: ["b.md", "b.md", 7, "a.md"] }).manualOrder)
  .toEqual(["b.md", "a.md"]);
```

Use existing imports and tests to avoid duplicate coverage. Add null/non-object load data only if absent. Run `npm test -- --runInBand src/settings/__tests__/settings-normalization.test.ts src/__tests__/main.test.ts`.

- [x] Inspect actual 0.5.4 and 0.6.1 tagged settings definitions with `git show 0.5.4:src/settings/settings.ts` and `git show 0.6.1:src/settings/settings.ts`. If tags are unavailable, fetch them without changing the checkout. Adapt legacy fixtures to observed historical fields; do not label invented JSON as captured old-version data.
- [x] In a separate test vault, install each old release, set a nonalphabetical manual order, hidden extensions, default sort/group, and view mode where supported. Record `data.json`, then replace only the three plugin assets with the candidate and reload. Verify preferences/order persist, missing settings get defaults, and subsequent rename/reorder/reload still work. Do not overwrite `data.json` during asset replacement.
- [ ] Test a fresh install with no `data.json`; ensure defaults load, no console errors occur, and basic operations work. This is a separate check from upgrade.
- [ ] On Obsidian 1.7.2 and the current stable release, run load/browse/search/create/rename/trash/manual-order/reload smoke checks. Record actual versions; API package version alone proves neither. If 1.7.2 is unavailable, mark BLOCKED. If an API or runtime feature fails, use a narrow compatible approach where practical; otherwise propose and document a tested minimum-version increase before metadata publication.
- [ ] On an actual iOS device and Android device, test tree/list, 44px-or-larger touch controls, long-press menu versus scrolling, long-press drag versus menu, scroll during reorder, Undo, soft-keyboard editing/cancel, collision feedback, portrait/landscape, safe areas, persistence and trash behavior. Record OS/app/device and exact observations. Emulation is useful for development but cannot mark these rows PASS.
- [ ] If Windows/Linux are available, run the same desktop smoke test; at minimum document which desktop OS was actually tested and inspect Unicode/case-only rename behavior on the tested filesystem. Do not claim universal desktop verification from one OS.
- [ ] Stop release promotion on any supported-platform data-integrity failure or missing required mobile/minimum-version evidence. Continue docs and automation tasks; report the exact device/action needed to clear each blocker. Do not automatically remove mobile support merely because no device is connected.

## Task 7: Align product and release documentation

**Files:** `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/release-checklist.md`, both active historical plan documents, `docs/release-notes/1.0.0.md`, evidence report.

- [x] Replace the README privacy paragraph and equivalent write-scope statements with this accurate scope:

```text
No network requests. Explicit user actions can create notes or folders, rename files or folders, and move items to the configured trash. Renaming follows Obsidian's internal-link update preference. Plugin settings and manual order are saved locally, including path maintenance after vault renames while the plugin is enabled.
```

- [x] Document Manual as list-only/ungrouped; Undo reverses ordering, not file operations; new files remain sortable; no-pane rename tracking requires the plugin to remain enabled. Describe existing file/folder rename and trash actions without implying bulk file management.
- [x] Update `AGENTS.md` and `CLAUDE.md` to the current version at this phase (do not claim 1.0 before Task 8), actual script list including release/fixture tests, and plugin-lifetime rename ownership. Preserve unrelated conventions.
- [x] Update the release checklist to require `npm run verify`, candidate-specific evidence, old-version upgrade/fresh install, rename links, Undo after structural events, no-pane rename, mobile/minimum-version checks, performance results, and artifact-install verification. Make large-vault acceptance mandatory for 1.0; do not impose this full matrix on every later documentation-only patch.
- [x] Add a status note at the top of the July reliability and August UX plans pointing to this plan and the evidence report. State that historical checkboxes are not the current delivery ledger. Mark only individually verified historical steps complete; do not blanket-check unexecuted manual acceptance.
- [x] Write user-facing 1.0 release notes: stable scope; link-safe rename; resilient manual ordering; tested compatibility; known limitations. Avoid claims such as “all platforms tested” unless the evidence supports them. Refer to existing features as the stable feature set, not all newly introduced in 1.0.
- [x] Search for drift with `rg -n '0\.5\.4|File writes|Vault writes|optional|npm test|1\.7\.2' README.md AGENTS.md CLAUDE.md docs/release-checklist.md docs/release-notes/1.0.0.md`. Preserve genuine historical references and update only stale current claims.
- [x] Run `git diff --check`, inspect relative links, and reconcile every PASS with observed evidence. Commit as `docs: define stable explorer behavior and release acceptance`. PR B must clearly state any BLOCKED device checks; it must not imply release approval.

## Task 8: Prepare the 1.0.0 release candidate

Prerequisite: reliability fixes merged (or explicitly accepted in the execution workflow), every mandatory acceptance row PASS, no unresolved data-integrity issue, and all runtime evidence maps to the candidate code. Tests performed before later runtime code changes must be rerun for the affected paths.

- [ ] Refresh remote main and inspect open PRs/issues and CI. Ensure intended fixes are included. Create `chore/release-1.0.0` from the verified main commit.
- [ ] Bump without creating an automatic commit or tag:

```bash
npm version 1.0.0 --no-git-tag-version
node scripts/validate-release.mjs 1.0.0
```

The existing version script updates/stages manifest and versions metadata; inspect the index and lockfile. Expect package and manifest 1.0.0, lockfile package version 1.0.0, and `versions.json['1.0.0']` equal to the verified minimum app version. Do not remove older compatibility entries.

- [ ] Update current-version documentation to 1.0.0. Finalize release notes and the gate decision. If only metadata changed, record that fact rather than rerunning unrelated exploratory analysis.
- [ ] Run `npm run verify`, `node scripts/validate-release.mjs 1.0.0`, `git diff --check`, and record asset hashes. Verify no fixture files, local settings, logs, instrumentation, or generated unrelated artifacts entered the diff.
- [ ] Commit as `chore: release 1.0.0`. If PR publication is authorized, push and open PR C with the change summary, evidence link, verification counts, and supported-version statement. Require CI `verify` success. Do not merge or tag unless that action is included in the execution authorization.

## Task 9: Publish and verify downloadable artifacts

Prerequisite: explicit publication authorization, merged release PR, successful CI on the release commit, and all gates PASS.

- [ ] Fetch main and confirm the release commit is contained in main. Verify `1.0.0` is not already a local or remote tag. If it exists, inspect its target and release state; never force-move it.
- [ ] Create `git tag 1.0.0` on the verified merged commit and push with `git push origin 1.0.0`. The tag is `1.0.0`, not `v1.0.0`; the validator rejects prefixes and prerelease suffixes. Do not call `gh release create` manually.
- [ ] Monitor the tag's release workflow to completion. Inspect failed logs before fixing anything; never assume an existing release page proves success.
- [ ] Confirm exactly the required assets are downloadable: `main.js`, `manifest.json`, `styles.css`. Download into a new temporary directory, validate manifest 1.0.0 and minimum version, record hashes and workflow commit, and install these downloaded assets into a clean test vault.
- [ ] Run fresh-install browse/search/create/rename/link-update/manual-order/reload smoke tests using downloaded assets. Local build success is not a substitute for this check.
- [ ] If authorized to edit release notes, replace generated notes with the prepared user-facing notes using a body file while retaining the CI-created release. Otherwise report that the notes are prepared and the release currently uses generated notes.
- [ ] Record release URL, tag commit, workflow result, asset checks, and installation observations in the evidence report through a follow-up documentation PR. Do not amend or move the released tag to include post-release evidence.
- [ ] If publication or artifact-install verification fails, record the release as failed/unverified and prepare a correction through the normal PR/version flow. Do not silently mark it complete or overwrite a published tag.

## Final completion checklist

- [x] File/folder rename uses FileManager and real link-update preferences were verified.
- [x] Undo survives rename/create/delete and leaves every current file sortable.
- [x] Shared manual-order paths stay correct with no explorer panes open while the plugin remains enabled.
- [x] Automated gate passes on the delivered code; runtime and upgrade evidence names that code.
- [ ] Required desktop, mobile, minimum-version, accessibility, and performance rows PASS.
- [x] Documentation matches behavior and clearly states limitations.
- [ ] Release metadata is consistent; publication only occurred within authorization.
- [ ] If published, downloaded assets were installed and verified.

Final handoff must contain: completed tasks, commit/PR references, exact checks run, remaining FAIL/BLOCKED rows with next actions, and one unambiguous state: `implementation complete; acceptance blocked`, `release candidate ready; publication pending`, or `1.0.0 published and verified`. Never collapse these states into a generic “done.”
