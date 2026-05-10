# Smart Explorer Development Plan

## 1. Positioning

**Plugin name:** Smart Explorer

**One-line goal:** Provide an alternative Obsidian side-pane file explorer with custom sorting, grouping, filtering, and lightweight previews without patching Obsidian's built-in File Explorer internals.

**Target users:**

- Users with large vaults who need faster navigation than the default file tree.
- Writers who organize notes by project, status, date, tag, or property.
- PKM users who want saved file views such as "recent drafts", "large notes", "untagged notes", or "research PDFs".

**Core product principle:** Build a separate, reversible explorer view first. Do not replace or monkey-patch Obsidian's native File Explorer in the first release.

## 2. Relationship To `obsidian-releases`

Smart Explorer should live in its own plugin repository. This `obsidian-releases` repository is only relevant when the plugin is ready for community listing:

- Add one entry to `community-plugins.json`.
- The entry `id` must match the plugin repository's `manifest.json`.
- GitHub releases must include `main.js`, `manifest.json`, and `styles.css` if styles are used.

## 3. MVP Scope

### Included In v0.1

- A new ribbon icon and command to open "Smart Explorer".
- A custom `ItemView` side pane that lists vault files and folders.
- Sort modes:
  - Name A-Z
  - Name Z-A
  - Modified newest first
  - Modified oldest first
  - Created newest first
  - Created oldest first
  - File extension
  - File size
- Group modes:
  - None
  - Folder
  - File extension
  - Modified month
  - Top-level folder
- Filter modes:
  - Search by file name/path
  - Extension filter
  - Markdown-only toggle
  - Attachments-only toggle
  - Recently modified range: 1 day, 7 days, 30 days
- Lightweight preview panel:
  - Markdown: first heading, first non-empty paragraph, tags/properties if available
  - Images: thumbnail
  - PDFs and other binary files: metadata-only preview
- Persisted settings:
  - Default sort mode
  - Default group mode
  - Preview enabled
  - Hidden file extensions

### Explicitly Out Of v0.1

- Replacing Obsidian's built-in File Explorer.
- Drag-and-drop file movement.
- Inline rename/delete/move.
- Custom manual ordering.
- Syncing custom ordering across devices.
- Full-text search inside file contents.
- Canvas graph previews.

The first release should earn trust by being read-heavy and low-risk.

## 4. Architecture

### Obsidian APIs To Use

- `Plugin` for lifecycle.
- `ItemView` and `WorkspaceLeaf` for the side-pane view.
- `Vault` for file enumeration and file metadata.
- `TFile` and `TFolder` for vault entities.
- `MetadataCache` for headings, frontmatter, links, tags, and cached metadata.
- `PluginSettingTab` for settings.

Reference docs:

- Obsidian plugin development: https://docs.obsidian.md/Plugins/Getting%20started/Build%20a%20plugin
- Obsidian plugin publishing: https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin
- Obsidian developer policies: https://docs.obsidian.md/Developer+policies

### Proposed File Structure

```text
smart-explorer/
  manifest.json
  package.json
  tsconfig.json
  esbuild.config.mjs
  src/
    main.ts
    constants.ts
    settings/
      settings.ts
      settings-tab.ts
    explorer/
      SmartExplorerView.ts
      FileIndex.ts
      FileTreeModel.ts
      sorters.ts
      groupers.ts
      filters.ts
      preview.ts
      render.ts
    ui/
      icons.ts
      controls.ts
      empty-state.ts
    tests/
      sorters.test.ts
      groupers.test.ts
      filters.test.ts
      preview.test.ts
  styles.css
  README.md
  LICENSE
```

### Module Responsibilities

- `main.ts`: plugin lifecycle, command registration, ribbon icon, view registration.
- `settings.ts`: typed settings schema, defaults, migration helpers.
- `settings-tab.ts`: settings UI.
- `SmartExplorerView.ts`: Obsidian `ItemView`, event wiring, render lifecycle.
- `FileIndex.ts`: creates normalized file records from vault files and metadata.
- `FileTreeModel.ts`: transforms flat records into grouped display sections.
- `sorters.ts`: pure sorting functions.
- `groupers.ts`: pure grouping functions.
- `filters.ts`: pure filtering functions.
- `preview.ts`: creates preview data from cached metadata and file type.
- `render.ts`: DOM rendering for rows, sections, preview panel.

Keep sorting, grouping, filtering, and preview extraction pure enough to test outside Obsidian.

## 5. Data Model

```ts
type SmartExplorerSettings = {
  defaultSort: SortMode;
  defaultGroup: GroupMode;
  previewEnabled: boolean;
  hiddenExtensions: string[];
  markdownOnly: boolean;
  attachmentsOnly: boolean;
};

type FileRecord = {
  path: string;
  basename: string;
  extension: string;
  parentPath: string;
  size: number;
  ctime: number;
  mtime: number;
  isMarkdown: boolean;
  isAttachment: boolean;
  frontmatter?: Record<string, unknown>;
  tags: string[];
  firstHeading?: string;
};

type ExplorerQuery = {
  searchText: string;
  sort: SortMode;
  group: GroupMode;
  extension: string | null;
  markdownOnly: boolean;
  attachmentsOnly: boolean;
  modifiedWithinDays: number | null;
};

type ExplorerSection = {
  id: string;
  title: string;
  records: FileRecord[];
};
```

## 6. UX Flow

1. User opens Command Palette and runs `Smart Explorer: Open`.
2. Obsidian opens a right-side leaf with the Smart Explorer view.
3. Top toolbar shows:
   - Search input
   - Sort dropdown
   - Group dropdown
   - Filter button
   - Preview toggle
4. Main list shows grouped file rows.
5. Clicking a row opens the file in the active editor leaf.
6. Hovering or selecting a row updates the preview panel.
7. Settings persist defaults, not transient search text.

## 7. Development Milestones

### Milestone 0: Repository Bootstrap

Goal: create a minimal, buildable Obsidian plugin.

Tasks:

- Scaffold from the official Obsidian sample plugin structure.
- Add TypeScript, esbuild, ESLint or the existing starter lint setup.
- Create `manifest.json` with:
  - `id`: `smart-explorer`
  - `name`: `Smart Explorer`
  - `version`: `0.1.0`
  - `minAppVersion`: choose a current stable baseline after testing
- Add README with local development instructions.
- Add MIT license unless another license is intentionally chosen.

Commit:

```bash
git commit -m "chore: scaffold smart explorer plugin"
```

Verification:

- `npm install`
- `npm run build`
- Plugin loads in a test vault without console errors.

### Milestone 1: View Registration And Shell

Goal: open a stable side-pane view.

Tasks:

- Register `SMART_EXPLORER_VIEW_TYPE`.
- Add ribbon icon and command.
- Implement `SmartExplorerView`.
- Render static toolbar and empty list.
- Add unload cleanup.

Commit:

```bash
git commit -m "feat: add smart explorer view shell"
```

Verification:

- Command opens the view.
- Ribbon icon opens the view.
- Closing/reopening the pane does not duplicate DOM or commands.

### Milestone 2: File Index

Goal: produce normalized records for all vault files.

Tasks:

- Implement `FileIndex.build()`.
- Read all files via `app.vault.getFiles()`.
- Normalize basename, extension, parent path, size, ctime, mtime.
- Pull cached metadata for Markdown files via `metadataCache.getFileCache(file)`.
- Extract tags and first heading from metadata.
- Add tests for record normalization.

Commit:

```bash
git commit -m "feat: index vault files for explorer"
```

Verification:

- Unit tests pass.
- Test vault with Markdown, images, PDFs, and nested folders renders expected records in console/debug output.

### Milestone 3: Sorting And Grouping

Goal: implement deterministic display ordering.

Tasks:

- Implement sort modes.
- Implement group modes.
- Add stable tie-breaker by path.
- Add tests for every sort and group mode.
- Render grouped sections in the view.

Commit:

```bash
git commit -m "feat: add file sorting and grouping"
```

Verification:

- Unit tests cover all sort and group modes.
- Manual vault check confirms sections stay stable after refresh.

### Milestone 4: Filtering Toolbar

Goal: make the explorer useful for large vaults.

Tasks:

- Add search input with debounce.
- Add extension dropdown.
- Add Markdown-only toggle.
- Add attachments-only toggle.
- Add modified range dropdown.
- Add empty state that explains active filters.
- Add tests for filter combinations.

Commit:

```bash
git commit -m "feat: add explorer filters"
```

Verification:

- Typing search does not lag on a vault with at least 2,000 files.
- Filters combine predictably.
- Clearing filters restores all files.

### Milestone 5: Preview Panel

Goal: show enough context to choose a file without opening it.

Tasks:

- Add selected-row state.
- For Markdown, show first heading, tags, and first paragraph.
- For images, show thumbnail using Obsidian resource paths.
- For other files, show extension, size, and modified time.
- Add preview toggle.
- Add tests for preview extraction.

Commit:

```bash
git commit -m "feat: add file preview panel"
```

Verification:

- Preview updates on selection.
- Large binary files are not read into memory.
- Missing metadata does not throw errors.

### Milestone 6: Settings

Goal: persist defaults without overcomplicating the first release.

Tasks:

- Add settings schema and defaults.
- Add settings tab.
- Persist default sort/group and preview enabled.
- Persist hidden extensions.
- Add migration guard for missing settings keys.

Commit:

```bash
git commit -m "feat: persist smart explorer settings"
```

Verification:

- Change settings, reload Obsidian, confirm persistence.
- Old settings file with missing keys falls back safely.

### Milestone 7: Performance Pass

Goal: avoid turning navigation into a slow plugin.

Tasks:

- Debounce rebuilds on vault changes.
- Listen to create/delete/rename/modify events.
- Rebuild index incrementally where simple; otherwise batch rebuild after short delay.
- Avoid reading full file contents except for limited Markdown preview.
- Add a visible "indexing" state for large vaults.

Commit:

```bash
git commit -m "perf: batch smart explorer index updates"
```

Verification:

- Test with a large vault.
- Rapid file changes do not create repeated full renders.
- UI remains responsive while typing in search.

### Milestone 8: Release Readiness

Goal: prepare for public review.

Tasks:

- Write README with screenshots, features, limitations, privacy notes.
- Add release checklist.
- Confirm no network requests.
- Confirm plugin does not alter files.
- Build release assets.

Commit:

```bash
git commit -m "docs: prepare smart explorer release"
```

Verification:

- Install from release assets into a clean test vault.
- Confirm `manifest.json` version matches release tag.
- Confirm required files are individual GitHub release assets.

## 8. Testing Strategy

### Unit Tests

- Sorting:
  - name ascending/descending
  - modified ascending/descending
  - size tie-breakers
- Grouping:
  - extension
  - folder
  - modified month
- Filtering:
  - query text
  - extension
  - markdown-only
  - attachments-only
  - modified range
- Preview:
  - Markdown with heading
  - Markdown without heading
  - image
  - binary file

### Manual Tests

- Fresh vault with 10 files.
- Real vault with 1,000+ files.
- Files with non-ASCII names.
- Deep folder paths.
- Empty vault.
- Vault with only attachments.

### Regression Checklist

- Plugin unload removes event listeners.
- Opening a file from the explorer respects Obsidian workspace behavior.
- Settings survive reload.
- No unexpected file writes.
- No network access.

## 9. Recommended Commit Sequence

1. `chore: scaffold smart explorer plugin`
2. `feat: add smart explorer view shell`
3. `feat: index vault files for explorer`
4. `feat: add file sorting and grouping`
5. `feat: add explorer filters`
6. `feat: add file preview panel`
7. `feat: persist smart explorer settings`
8. `perf: batch smart explorer index updates`
9. `docs: prepare smart explorer release`

Each commit should build and should keep the plugin loadable. Avoid bundling UI, indexing, and settings into one commit.

## 10. Risks And Mitigations

- **Risk:** Obsidian internal File Explorer changes break plugin behavior.
  - **Mitigation:** Use a separate `ItemView`; do not patch native File Explorer.
- **Risk:** Large vault performance degrades.
  - **Mitigation:** Use cached metadata, debounce rebuilds, and avoid reading full files.
- **Risk:** Feature creep toward full file manager.
  - **Mitigation:** No write actions in v0.1 except settings.
- **Risk:** Preview reads too much data.
  - **Mitigation:** Use metadata cache first; cap Markdown preview reads.

## 11. Future Roadmap

### v0.2

- Saved views.
- Property-based grouping.
- Tag-based grouping.
- Pin favorite filters.

### v0.3

- Manual custom order per folder.
- Optional drag-and-drop reordering inside Smart Explorer.
- Keyboard navigation.

### v0.4

- File operations with confirmation:
  - rename
  - move
  - reveal in native explorer

Do not add destructive operations before the read-only explorer is stable and trusted.
