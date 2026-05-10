# Smart Explorer

Obsidian plugin — alternative side-pane file explorer with sorting, grouping, filtering, and preview.

## Commands

```bash
npm run dev       # esbuild watch mode
npm run build     # tsc check + esbuild production
npm test          # jest with ts-jest
```

## Architecture

```
src/main.ts                  Plugin entry: registers view, commands, settings
src/constants.ts             View type constant
src/types.ts                 FileRecord, ExplorerQuery, ExplorerSection, SortMode, GroupMode

src/explorer/SmartExplorerView.ts   ItemView: toolbar, list rendering, preview panel
src/explorer/FileIndex.ts           Builds FileRecord[] from vault + metadataCache
src/explorer/FileTreeModel.ts       Orchestrates filter → sort → group pipeline
src/explorer/sorters.ts             Pure sorting functions (8 modes, path tie-breaker)
src/explorer/groupers.ts            Pure grouping functions (4 modes)
src/explorer/filters.ts             Pure filter functions (search, extension, type, date range)
src/explorer/preview.ts             PreviewData extraction (markdown/image/binary)

src/settings/settings.ts            Settings type + defaults
src/settings/settings-tab.ts        PluginSettingTab UI
src/settings/settings-helpers.ts    Sort/group option lists (shared by toolbar + settings)

src/explorer/__tests__/*.test.ts    Unit tests for sorters, groupers, filters, preview, FileIndex
```

**Data flow:** `FileIndex.build()` → `buildSections(records, query)` → filter → sort → group → render

## Conventions

- Sorters, groupers, filters, preview are pure functions — testable without Obsidian
- FileIndex is the single source of truth for vault file data
- Vault events (create/delete/rename/modify) update FileIndex incrementally, debounced at 300ms
- No network requests, no file writes (read-only plugin)
- Obsidian CSS variables for theming, prefixed with `.smart-explorer-`

## Branch rules

- `main` branch: PR required, CI `verify` job must pass, no force push, no deletion
- Commit format: `type: description` (feat/fix/perf/chore/docs)
- All changes go through PR

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
