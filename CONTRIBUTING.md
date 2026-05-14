# Contributing

Thanks for your interest in contributing to Smart Explorer!

## Getting Started

```bash
git clone https://github.com/rogerdigital/smart-explorer.git
cd smart-explorer
npm install
npm run dev
```

Link the plugin to your vault for live development:

```bash
ln -sf "$(pwd)" "/path/to/vault/.obsidian/plugins/smart-explorer"
```

## Development Workflow

1. Create a branch from `main`
2. Make changes and verify with `npm run build` and `npm test`
3. Open a pull request against `main`

## Code Style

- Run `npm run lint` before submitting
- Follow existing patterns in the codebase
- Keep changes focused and minimal

## Commit Messages

Use conventional format: `type: description`

Types: `feat`, `fix`, `perf`, `chore`, `docs`

## Testing

- Add unit tests for new sorters, groupers, or filters
- Tests live in `src/explorer/__tests__/`
- Run with `npm test`

## Reporting Issues

Open a GitHub issue with:
- Steps to reproduce
- Expected vs actual behavior
- Obsidian version and OS
