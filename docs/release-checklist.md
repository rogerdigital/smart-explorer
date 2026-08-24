# Release Checklist

## Pre-release

- [ ] All tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Version bumped in `package.json`, `manifest.json`, `versions.json`
- [ ] `manifest.json` version matches `versions.json` entry
- [ ] Changelog / release notes drafted
- [ ] No network requests in codebase (`grep -rn "fetch\|XMLHttpRequest" src/`)
- [ ] Vault writes are limited to explicit create-note/create-folder actions and plugin settings
- [ ] Large-vault check (optional but recommended before perf-touching releases):
  - [ ] Create the synthetic fixture: `node scripts/prepare-large-vault-fixture.mjs --vault <test-vault> --files 5000`
  - [ ] Closed tree shows folder summaries only; flat list stays smooth and bounded
  - [ ] Remove the fixture afterwards: `node scripts/prepare-large-vault-fixture.mjs --vault <test-vault> --remove`; confirm the vault is otherwise untouched
- [ ] Plugin tested in Obsidian vault:
  - [ ] Loads without console errors
  - [ ] File list displays correctly
  - [ ] Sort, group, filter controls work
  - [ ] Tree/list toggle works
  - [ ] New note and new folder actions create items in the expected folder
  - [ ] Collapse all and reveal active file work in tree mode
  - [ ] Manual drag handles and undo work in Manual sort mode
  - [ ] Keyboard navigation works: Tab enters once, arrows move, ArrowRight/Left open/close folders, Enter opens files, Alt+Arrow reorders in Manual mode
  - [ ] Settings persist after reload
  - [ ] Vault events (create/delete/rename/modify) trigger reindex

## Create Release

- [ ] Create git tag: `git tag <version>`
- [ ] Push tag: `git push origin <version>`
- [ ] Confirm the release workflow created or updated the GitHub Release
- [ ] Confirm release assets are attached:
  - [ ] `main.js`
  - [ ] `manifest.json`
  - [ ] `styles.css`

## Post-release

- [ ] Verify release assets are downloadable
- [ ] Install from release assets into a clean test vault
- [ ] Confirm plugin works on fresh install
