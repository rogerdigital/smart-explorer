# Release Checklist

## Pre-release

- [ ] All tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Version bumped in `package.json`, `manifest.json`, `versions.json`
- [ ] `manifest.json` version matches `versions.json` entry
- [ ] Changelog / release notes drafted
- [ ] No network requests in codebase (`grep -rn "fetch\|XMLHttpRequest" src/`)
- [ ] No file write operations (`grep -rn "vault\.modify\|vault\.create\|vault\.delete" src/`)
- [ ] Plugin tested in Obsidian vault:
  - [ ] Loads without console errors
  - [ ] File list displays correctly
  - [ ] Sort, group, filter controls work
  - [ ] Tree/list toggle works
  - [ ] Manual drag handles and undo work in Manual sort mode
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
