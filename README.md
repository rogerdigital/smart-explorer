# Smart Explorer

A tree-first side-pane explorer for browsing, filtering, and manually sorting your [Obsidian](https://obsidian.md) files.

Built for vaults with hundreds or thousands of notes where the default file tree falls short, especially project folders that need a human priority order instead of only alphabetical sorting.

![Smart Explorer manual sorting](docs/images/smart-explorer-manual-sort.gif)

## Features

| Category | Options |
|----------|---------|
| **Browse** | Folder tree by default, with folder counts and compact hover details |
| **Create** | Create notes and folders via toolbar, context menu, or command palette — with inline name editing |
| **Edit** | Rename files inline; extensions stay fixed so only the name changes |
| **Sort** | Name (A-Z / Z-A), modified date, created date, extension, file size, manual drag order |
| **Filter** | Search by name/path, file kind (all / markdown / attachments / images), date range (1d / 7d / 30d) |
| **View** | Tree/list toggle; Manual sort automatically uses list mode for direct drag-and-drop |
| **Commands** | Open, focus search, reveal active file, new note, new folder — all in the Command Palette |
| **Keyboard** | Focus search, clear search, move through rows, and open selected files |
| **Settings** | Default sort/group mode, hidden extensions, reset manual order |

### Manual Drag-and-Drop Sorting

Switch to **Manual** sort mode to drag the handle beside a file and reorder it. The starting order matches whatever sort you were viewing ("what you see is what you drag"), shown in a toolbar hint. Use **Undo** to revert the last reorder. The custom order is saved per vault, keeps new files draggable, and persists across sessions. Works on both desktop and mobile.

## Installation

### Community Plugins (recommended)

1. Open **Settings → Community Plugins → Browse**
2. Search for **Smart Explorer**
3. Click **Install**, then **Enable**

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/rogerdigital/smart-explorer/releases)
2. Create `.obsidian/plugins/smart-explorer/` in your vault
3. Copy the three files into that folder
4. Enable in **Settings → Community Plugins**

## Usage

1. Open via ribbon icon or Command Palette → **Smart Explorer: Open**
2. Use the first toolbar row for tree/list mode, sorting, new notes/folders, search, and filters
3. Click search to reveal the search box; click filters for grouping, file kind, and modified-date filters
4. Click a file to open it in Obsidian
5. Use the clear button near the file count to clear active search and filters
6. Defaults persist in **Settings → Community Plugins → Smart Explorer**

### Keyboard & Commands

- `Cmd/Ctrl+F` focuses the search box
- `Esc` clears search text or closes the filter row
- `Arrow Up/Down` moves through file rows
- `Enter` opens the focused file
- Command Palette actions: **Smart Explorer: Open**, **Focus search**, **Reveal active file**, **New note**, **New folder**

## Compatibility

- Obsidian ≥ 1.7.2
- Desktop and mobile

## Privacy

No network requests. File writes only happen when you explicitly create a note or folder.

## Development

```bash
npm install       # install dependencies
npm run dev       # watch mode
npm run build     # type-check + production build
npm test          # unit tests
npm run lint      # eslint
```

## License

[MIT](LICENSE)
