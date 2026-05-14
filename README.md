# Smart Explorer

A side-pane file explorer for [Obsidian](https://obsidian.md) with flexible sorting, grouping, filtering, and inline previews.

Built for vaults with hundreds or thousands of notes where the default file tree falls short.

![Smart Explorer](./docs/screenshots/smart-explorer-right-panel.png)

## Features

| Category | Options |
|----------|---------|
| **Sort** | Name (A-Z / Z-A), modified date, created date, extension, file size |
| **Group** | Folder, extension, modified month, top-level folder |
| **Filter** | Search by name/path, markdown-only, attachments-only, date range (1d / 7d / 30d) |
| **Preview** | Headings & tags for markdown, thumbnails for images, metadata for other files |
| **Settings** | Default sort/group mode, preview panel toggle, hidden extensions |

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
2. Toolbar controls sorting, grouping, and filtering
3. Click a file to open; preview panel shows context alongside the file list
4. Defaults persist in **Settings → Community Plugins → Smart Explorer**

## Compatibility

- Obsidian ≥ 1.7.2
- Desktop and mobile

## Privacy

No network requests. All data stays local in your vault.

## Development

```bash
npm install       # install dependencies
npm run dev       # watch mode
npm run build     # type-check + production build
npm test          # unit tests
```

## License

[MIT](LICENSE)
