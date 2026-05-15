# Smart Explorer

Obsidian plugin — alternative side-pane file explorer with sorting, grouping, filtering, and preview.

- Plugin ID: `smart-explorer`
- Current version: `0.3.2`
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

src/explorer/SmartExplorerView.ts   ItemView: toolbar, list rendering, preview panel
src/explorer/FileIndex.ts           Builds FileRecord[] from vault + metadataCache
src/explorer/FileTreeModel.ts       Orchestrates filter → sort → group pipeline
src/explorer/VirtualList.ts         Virtual scrolling list component
src/explorer/DragSortManager.ts     Manual drag-and-drop sorting
src/explorer/sorters.ts             Pure sorting functions (8 modes, path tie-breaker)
src/explorer/groupers.ts            Pure grouping functions (5 modes: none, folder, extension, modified-month, top-folder)
src/explorer/filters.ts             Pure filter functions (search, extension, type, date range)
src/explorer/preview.ts             PreviewData extraction (markdown/image/binary)

src/settings/settings.ts            Settings type + defaults
src/settings/settings-tab.ts        PluginSettingTab UI
src/settings/settings-helpers.ts    Sort/group option lists (shared by toolbar + settings)

src/explorer/__tests__/*.test.ts    Unit tests for sorters, groupers, filters, preview, FileIndex, FileTreeModel
```

**Data flow:** `FileIndex.build()` → `buildSections(records, query)` → filter → sort → group → VirtualList render

## Conventions

- Sorters, groupers, filters, preview are pure functions — testable without Obsidian
- FileIndex is the single source of truth for vault file data
- Vault events (create/delete/rename/modify) update FileIndex incrementally, debounced at 300ms
- No network requests, no file writes (read-only plugin)
- Obsidian CSS variables for theming, prefixed with `.smart-explorer-`
- Tests use Jest with ts-jest, `__tests__` subdirectory per module

## Git workflow

- `main` branch: PR required, CI `verify` job must pass, no force push, no deletion
- Commit format: `type: description` (feat/fix/perf/chore/docs)
- No co-author footers or AI attribution in commits
- All changes go through PR

## Release

- Release assets: `main.js`, `manifest.json`, `styles.css`
- Release steps: bump version in `manifest.json` + `versions.json` → PR → merge → tag → push tag → CI creates release
- Do NOT manually `gh release create` — CI auto-creates on tag push

## Key files to modify

| Want to... | Edit |
|---|---|
| Add sort mode | `sorters.ts` + `types.ts` (SortMode union) + `settings-helpers.ts` |
| Add group mode | `groupers.ts` + `types.ts` (GroupMode union) + `settings-helpers.ts` |
| Add filter | `filters.ts` + `types.ts` (ExplorerQuery) + `SmartExplorerView.ts` (toolbar) |
| Change preview | `preview.ts` + `SmartExplorerView.ts` (renderPreviewContent) |
| Change toolbar layout | `SmartExplorerView.ts` (renderToolbar) + `styles.css` |
| Add settings | `settings.ts` + `settings-tab.ts` + `main.ts` (load/save) |
| Fix rendering | `SmartExplorerView.ts` + `styles.css` |
| Add vault event handling | `SmartExplorerView.ts` (registerVaultEvents) |
