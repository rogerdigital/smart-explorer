# Smart Explorer

Obsidian plugin — alternative side-pane file explorer with tree/list browsing, sorting, grouping, filtering, and manual order.

- Plugin ID: `smart-explorer`
- Current version: `0.5.0`
- Min Obsidian version: `1.7.2`

## Commands

```bash
npm run dev       # esbuild watch mode
npm run build     # tsc check + esbuild production
npm test          # jest with ts-jest
npm run lint      # eslint
```

## Architecture

```
src/main.ts                  Plugin entry: registers view, commands, settings
src/constants.ts             View type constant
src/types.ts                 FileRecord, ExplorerQuery, ExplorerSection, SortMode, GroupMode

src/explorer/SmartExplorerView.ts   ItemView: compact toolbar, tree/list rendering, manual order UI
src/explorer/FileIndex.ts           Builds FileRecord[] from vault + metadataCache
src/explorer/FileTreeModel.ts       Orchestrates filter → sort → group pipeline
src/explorer/TreeModel.ts           Builds folder-tree nodes for tree mode
src/explorer/VirtualList.ts         Virtual scrolling list component
src/explorer/DragSortManager.ts     Manual drag-and-drop sorting
src/explorer/dropIndex.ts           Pure drop-index calculation from row bounds
src/explorer/manualOrder.ts         Pure manual-order reorder + reconcile operations
src/explorer/sorters.ts             Pure sorting functions (8 modes, path tie-breaker)
src/explorer/groupers.ts            Pure grouping functions (5 modes: none, folder, extension, modified-month, top-folder)
src/explorer/filters.ts             Pure filter functions (search, extension, file kind, date range)
src/explorer/filterState.ts         Clear/detect active search and filters
src/explorer/fileRow.ts             File row display formatting helpers
src/explorer/creationPath.ts        Pure helpers for new note/folder target paths
src/explorer/treeFolderInfo.ts      Tree folder hover metadata helpers
src/explorer/treeExpansion.ts       Pure tree folder expand/collapse state helpers
src/explorer/revealPath.ts          Pure path-reveal helpers for active file / search results
src/explorer/touchLongPress.ts      Pure touch long-press threshold helpers
src/explorer/viewMode.ts            Resolves effective tree/list mode + manual seed sort

src/settings/settings.ts            Settings type + defaults
src/settings/settings-tab.ts        PluginSettingTab UI
src/settings/settings-helpers.ts    Sort/group option lists (shared by toolbar + settings)

src/explorer/__tests__/*.test.ts    Unit tests for pure explorer helpers and models
```

**List data flow:** `FileIndex.build()` → hidden-extension filter → `buildSections(records, query)` → filter → sort → group → `VirtualList` render

**Tree data flow:** `FileIndex.build()` → hidden-extension filter → `buildTree(records, query)` → filter → folder tree sort → recursive tree render

**Manual sort flow:** Manual sort resolves to list mode, initializes `settings.manualOrder`, attaches `DragSortManager` to row handles, and persists reordered paths through plugin settings.

## Conventions

- Sorters, groupers, filters, tree models, view-mode helpers, filter-state helpers, and manual-order helpers are pure functions — testable without Obsidian
- FileIndex is the single source of truth for vault file data
- Vault events (create/delete/rename/modify) update FileIndex incrementally, debounced at 300ms
- No network requests. Vault writes are limited to explicit user actions: creating notes/folders and saving plugin settings/manual order.
- Obsidian CSS variables for theming, prefixed with `.smart-explorer-`
- Tests use Jest with ts-jest, `__tests__` subdirectory per module

## Git workflow

- `main` branch: PR required, CI `verify` job must pass, no force push, no deletion
- Commit format: `type: description` (feat/fix/perf/chore/docs)
- No co-author footers or AI attribution in commits
- All changes go through PR

## Release

- Release assets: `main.js`, `manifest.json`, `styles.css`
- Release steps: bump version in `package.json`, `manifest.json`, and `versions.json` → PR → merge → tag → push tag → CI creates release
- Do NOT manually `gh release create` — CI auto-creates on tag push

## Key files to modify

| Want to... | Edit |
|---|---|
| Add sort mode | `sorters.ts` + `types.ts` (SortMode union) + `settings-helpers.ts` |
| Add group mode | `groupers.ts` + `types.ts` (GroupMode union) + `settings-helpers.ts` |
| Add filter | `filters.ts` + `types.ts` (ExplorerQuery) + `SmartExplorerView.ts` (toolbar) |
| Change tree view | `TreeModel.ts` / `treeFolderInfo.ts` + `SmartExplorerView.ts` |
| Change manual ordering | `manualOrder.ts` + `DragSortManager.ts` + `SmartExplorerView.ts` |
| Change create actions | `creationPath.ts` + `SmartExplorerView.ts` |
| Change toolbar layout | `SmartExplorerView.ts` (renderToolbar) + `styles.css` |
| Add settings | `settings.ts` + `settings-tab.ts` + `main.ts` (load/save) |
| Fix rendering | `SmartExplorerView.ts` + `styles.css` |
| Add vault event handling | `SmartExplorerView.ts` (registerVaultEvents) |
