# Smart Explorer Reliability Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all confirmed manual-order, search/reveal, tree-performance, CI, and release-safety problems without expanding Smart Explorer's product scope.

**Architecture:** Keep `FileIndex` as the complete vault truth and treat hidden extensions/search/type/date filters only as display projections. Manual order remains a complete persisted permutation of all indexed files; drag operations map visible anchors back into that permutation. Small stateful UI boundaries get focused tests, tree sorting uses path-indexed lookup, and CI plus release share one local `verify` command.

**Tech Stack:** TypeScript, Obsidian API, Jest with ts-jest, esbuild, ESLint, Node.js built-in test runner, GitHub Actions.

---

## Scope and file map

### Files to modify

- `src/explorer/manualOrder.ts`
  - Reconcile a complete, unique manual-order permutation.
  - Map filtered visible drag positions back to global order.
  - Rewrite file and folder paths after rename.
- `src/explorer/SmartExplorerView.ts`
  - Initialize manual order from the complete `FileIndex`.
  - Persist renamed manual-order paths.
  - Replace the unsafe search timer with a cancellable scheduler.
  - Clear blocking query filters before revealing the active file.
- `src/explorer/TreeModel.ts`
  - Replace repeated linear node lookup with a path map.
- `src/explorer/__tests__/manualOrder.test.ts`
  - Cover filtered drag, hidden files, incomplete seeds, duplicate paths, and rename rewriting.
- `src/explorer/__tests__/TreeModel.test.ts`
  - Cover the path-indexed file-node sorter.
- `src/explorer/__tests__/SmartExplorerView.test.ts`
  - Cover rename-save scheduling, search-clear cancellation, and reveal-state behavior.
- `package.json`
  - Add shared `verify` and release-validator test scripts.
- `README.md`, `AGENTS.md`, `CLAUDE.md`
  - Document the shared verification command.
- `.github/workflows/ci.yml`
  - Run the shared verification gate, including lint.
- `.github/workflows/release.yml`
  - Validate release metadata and main ancestry before publishing.

### Files to create

- `src/explorer/searchRenderScheduler.ts`
  - Own the single cancellable 200ms search-render debounce.
- `src/explorer/__tests__/searchRenderScheduler.test.ts`
  - Verify cancellation and latest-input behavior with fake timers.
- `scripts/validate-release.mjs`
  - Validate semantic tag, package/manifest equality, and `versions.json`.
- `scripts/__tests__/validate-release.test.mjs`
  - Exercise release metadata validation with Node's built-in test runner.

### Deliberately unchanged

- `src/explorer/DragSortManager.ts`
  - It should continue reporting a visible insertion boundary; global mapping belongs in `manualOrder.ts`.
- `src/explorer/filters.ts`
  - Filter semantics are correct; only their interaction with persisted manual order is wrong.
- `manifest.json`, `versions.json`
  - No release is being cut as part of these fixes.

---

### Task 0: Create an isolated implementation branch

**Files:**

- No source files

- [ ] **Step 1: Confirm the starting point is clean and current**

Run:

```bash
git status --short --branch
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main
```

Expected: the two revisions match and there are no unrelated changes. The untracked plan file created during planning is expected; any other user change must be preserved and isolated with `superpowers:using-git-worktrees` before editing.

- [ ] **Step 2: Create the implementation branch before any commits**

Run:

```bash
git switch -c fix/reliability-and-release-guards
```

Expected: the current branch is `fix/reliability-and-release-guards`.

- [ ] **Step 3: Commit the reviewed implementation plan on the branch**

Run:

```bash
git add docs/superpowers/plans/2026-07-29-smart-explorer-reliability-fixes.md
git commit -m "docs: add reliability fix plan"
```

Expected: the implementation branch contains the plan and the worktree is clean before source changes begin.

---

### Task 1: Make manual reordering correct for filtered visible rows

**Files:**

- Modify: `src/explorer/manualOrder.ts:1-102`
- Modify: `src/explorer/__tests__/manualOrder.test.ts:19-83`

- [ ] **Step 1: Replace grouped-only test coverage with filtered/global-order regressions**

Add these tests under `describe("reorderManualOrder")`:

```ts
it("maps a filtered drop target back into the global order", () => {
	const order = ["a.md", "b.md", "c.md", "d.md"];
	const sections = [{
		id: "all",
		records: ["c.md", "d.md"].map(makeRecord),
	}];

	const result = reorderManualOrder(order, "d.md", 0, sections);

	expect(result).toEqual(["a.md", "b.md", "d.md", "c.md"]);
});

it("moves a visible item after the last visible anchor without moving trailing hidden files", () => {
	const order = ["a.md", "hidden-1.md", "b.md", "hidden-2.md"];
	const sections = [{
		id: "all",
		records: ["a.md", "b.md"].map(makeRecord),
	}];

	const result = reorderManualOrder(order, "a.md", 2, sections);

	expect(result).toEqual(["hidden-1.md", "b.md", "a.md", "hidden-2.md"]);
});

it("does not move the only visible item", () => {
	const order = ["hidden-a.md", "visible.md", "hidden-b.md"];
	const sections = [{
		id: "all",
		records: [makeRecord("visible.md")],
	}];

	const result = reorderManualOrder(order, "visible.md", 1, sections);

	expect(result).toEqual(order);
});
```

Update existing calls to remove the unreachable `group` and `sectionId` arguments. Manual sort already forces `group: "none"` in `viewMode.ts` and `SmartExplorerView.ts`, so grouped manual ordering is not part of the live product surface.

- [ ] **Step 2: Run the focused tests and confirm the filtered cases fail**

Run:

```bash
npm test -- --runInBand src/explorer/__tests__/manualOrder.test.ts
```

Expected: the filtered/global-order assertions fail because visible `toIndex` is still treated as a global array index.

- [ ] **Step 3: Replace index arithmetic with visible-anchor mapping**

Replace `reorderManualOrder` and remove `GroupMode` plus `clampToGroupEnd`:

```ts
export function reorderManualOrder(
	currentOrder: string[],
	draggedPath: string,
	toIndex: number,
	sections: ManualOrderSection[],
): string[] {
	const visiblePaths = sections.flatMap((section) =>
		section.records.map((record) => record.path),
	);
	const fromVisible = visiblePaths.indexOf(draggedPath);
	if (fromVisible < 0) return [...currentOrder];

	const visibleWithoutDragged = visiblePaths.filter((path) => path !== draggedPath);
	if (visibleWithoutDragged.length === 0) return [...currentOrder];

	const nextOrder = currentOrder.filter((path) => path !== draggedPath);
	if (nextOrder.length === currentOrder.length) return [...currentOrder];

	const adjustedVisibleIndex = fromVisible < toIndex ? toIndex - 1 : toIndex;
	const targetVisibleIndex = Math.max(
		0,
		Math.min(adjustedVisibleIndex, visibleWithoutDragged.length),
	);
	const targetPath = visibleWithoutDragged[targetVisibleIndex];

	let targetGlobalIndex: number;
	if (targetPath !== undefined) {
		targetGlobalIndex = nextOrder.indexOf(targetPath);
		if (targetGlobalIndex < 0) return [...currentOrder];
	} else {
		const lastVisiblePath = visibleWithoutDragged[
			visibleWithoutDragged.length - 1
		];
		const lastVisibleIndex = lastVisiblePath === undefined
			? -1
			: nextOrder.indexOf(lastVisiblePath);
		targetGlobalIndex = lastVisibleIndex < 0
			? nextOrder.length
			: lastVisibleIndex + 1;
	}

	nextOrder.splice(targetGlobalIndex, 0, draggedPath);
	return nextOrder;
}
```

- [ ] **Step 4: Run the focused tests**

Run:

```bash
npm test -- --runInBand src/explorer/__tests__/manualOrder.test.ts
```

Expected: all manual-order tests pass, including own-slot, front, filtered-front, filtered-end, and non-mutating cases.

- [ ] **Step 5: Commit the pure reorder fix**

```bash
git add src/explorer/manualOrder.ts src/explorer/__tests__/manualOrder.test.ts
git commit -m "fix: map filtered drag positions to manual order"
```

---

### Task 2: Keep manual order complete and persist rename updates

**Files:**

- Modify: `src/explorer/manualOrder.ts`
- Modify: `src/explorer/SmartExplorerView.ts:220-245,588-613,1218-1265`
- Modify: `src/explorer/__tests__/manualOrder.test.ts`
- Create: `src/explorer/__tests__/SmartExplorerView.test.ts`

- [ ] **Step 1: Add reconciliation and rename regression tests**

Add to `manualOrder.test.ts`:

```ts
it("keeps every known file when the fallback order is partial", () => {
	const records = ["a.md", "b.md", "c.md"].map(makeRecord);

	const result = reconcileManualOrder([], records, ["b.md"]);

	expect(result).toEqual(["b.md", "a.md", "c.md"]);
});

it("deduplicates saved paths while preserving the first occurrence", () => {
	const records = ["a.md", "b.md"].map(makeRecord);

	const result = reconcileManualOrder(
		["a.md", "a.md", "b.md"],
		records,
		["b.md", "a.md"],
	);

	expect(result).toEqual(["a.md", "b.md"]);
});

it("rewrites a renamed file path without changing its position", () => {
	expect(renameManualOrderPaths(
		["a.md", "folder/old.md", "b.md"],
		"folder/old.md",
		"folder/new.md",
	)).toEqual(["a.md", "folder/new.md", "b.md"]);
});

it("rewrites every child path after a folder rename", () => {
	expect(renameManualOrderPaths(
		["a.md", "old/x.md", "old/nested/y.md", "b.md"],
		"old",
		"new",
	)).toEqual(["a.md", "new/x.md", "new/nested/y.md", "b.md"]);
});

it("returns the same reference when a rename does not affect the order", () => {
	const order = ["a.md", "b.md"];

	expect(renameManualOrderPaths(order, "missing", "new")).toBe(order);
});
```

Import `renameManualOrderPaths` with the other manual-order helpers.

- [ ] **Step 2: Add a narrow view test proving rename schedules persistence**

Create `SmartExplorerView.test.ts` with a local Obsidian mock and a prototype-only view:

```ts
jest.mock(
	"obsidian",
	() => ({
		ItemView: class {},
		Menu: class {},
		Modal: class {},
		Notice: class {},
		Platform: { isMobile: false },
		Setting: class {},
		setIcon: jest.fn(),
		TFile: class {},
		TFolder: class {},
		WorkspaceLeaf: class {},
	}),
	{ virtual: true },
);

import { SmartExplorerView } from "../SmartExplorerView";

function makeBareView(order: string[]) {
	const view = Object.create(SmartExplorerView.prototype) as any;
	view.plugin = { settings: { manualOrder: order } };
	view.buildManualOrderIndex = jest.fn();
	view.scheduleSaveOrder = jest.fn();
	return view;
}

describe("SmartExplorerView manual-order state", () => {
	it("updates the order index and schedules a save after rename", () => {
		const view = makeBareView(["a.md", "old/x.md", "b.md"]);

		view.updateManualOrderAfterRename("old", "new");

		expect(view.plugin.settings.manualOrder).toEqual([
			"a.md",
			"new/x.md",
			"b.md",
		]);
		expect(view.buildManualOrderIndex).toHaveBeenCalledTimes(1);
		expect(view.scheduleSaveOrder).toHaveBeenCalledTimes(1);
	});

	it("does not schedule a save when no ordered path changed", () => {
		const view = makeBareView(["a.md", "b.md"]);

		view.updateManualOrderAfterRename("missing", "new");

		expect(view.scheduleSaveOrder).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 3: Run both tests and confirm they fail**

Run:

```bash
npm test -- --runInBand \
  src/explorer/__tests__/manualOrder.test.ts \
  src/explorer/__tests__/SmartExplorerView.test.ts
```

Expected: imports/methods for rename rewriting are missing, and partial fallback still omits known files.

- [ ] **Step 4: Make reconciliation return a complete unique permutation**

Replace `reconcileManualOrder` with:

```ts
export function reconcileManualOrder(
	currentOrder: string[],
	records: FileRecord[],
	fallbackOrder: string[] = records.map((record) => record.path),
): string[] {
	const knownPaths = records.map((record) => record.path);
	const known = new Set(knownPaths);
	const seen = new Set<string>();
	const nextOrder: string[] = [];

	const appendKnown = (paths: string[]) => {
		for (const path of paths) {
			if (!known.has(path) || seen.has(path)) continue;
			seen.add(path);
			nextOrder.push(path);
		}
	};

	appendKnown(currentOrder);
	appendKnown(fallbackOrder);
	appendKnown(knownPaths);

	if (
		nextOrder.length === currentOrder.length &&
		nextOrder.every((path, index) => path === currentOrder[index])
	) {
		return currentOrder;
	}
	return nextOrder;
}
```

Add the rename helper:

```ts
export function renameManualOrderPaths(
	currentOrder: string[],
	oldPath: string,
	newPath: string,
): string[] {
	let changed = false;
	const oldPrefix = `${oldPath}/`;
	const nextOrder = currentOrder.map((path) => {
		if (path === oldPath) {
			changed = true;
			return newPath;
		}
		if (path.startsWith(oldPrefix)) {
			changed = true;
			return `${newPath}/${path.slice(oldPrefix.length)}`;
		}
		return path;
	});
	return changed ? nextOrder : currentOrder;
}
```

- [ ] **Step 5: Initialize from the complete index, not the display subset**

In `renderListContent`, preserve the complete record set:

```ts
const allRecords = this.fileIndex.getAll();
let records = allRecords;
if (hiddenExts.size > 0) {
	records = allRecords.filter((record) => !hiddenExts.has(record.extension));
}

if (this.query.sort === "manual") {
	this.initializeManualOrder(allRecords);
}
```

Remove the old later call that passed filtered `records`.

In `initializeManualOrder`, build a complete seed independent of display filters:

```ts
private initializeManualOrder(allRecords: FileRecord[]) {
	const order = this.plugin.settings.manualOrder;
	const seeded = buildSections(allRecords, {
		...this.query,
		searchText: "",
		group: "none",
		extension: null,
		fileKind: "all",
		modifiedWithinDays: null,
		sort: this.manualSeedSort,
	});
	const fallbackOrder = seeded[0]?.records.map((record) => record.path) ?? [];
	const reconciled = reconcileManualOrder(order, allRecords, fallbackOrder);
	if (reconciled !== order) {
		this.plugin.settings.manualOrder = reconciled;
		this.scheduleSaveOrder();
	}
	this.buildManualOrderIndex();
}
```

Update `handleManualReorder` to call the new four-argument `reorderManualOrder`:

```ts
const nextOrder = reorderManualOrder(
	order,
	draggedPath,
	toIndex,
	sections,
);
```

Remove its unused `group` and `sectionId` parameters, and simplify the `DragSortManager` callback accordingly.

- [ ] **Step 6: Route both file and folder renames through one persistence method**

Import `renameManualOrderPaths`, then add:

```ts
private updateManualOrderAfterRename(oldPath: string, newPath: string) {
	const order = this.plugin.settings.manualOrder;
	const nextOrder = renameManualOrderPaths(order, oldPath, newPath);
	if (nextOrder === order) return;

	this.plugin.settings.manualOrder = nextOrder;
	this.buildManualOrderIndex();
	this.scheduleSaveOrder();
}
```

In the rename event:

```ts
if (file instanceof TFile) {
	this.fileIndex.removeFile(oldPath);
	this.fileIndex.addFile(file);
	if (this.selectedPath === oldPath) {
		this.selectedPath = file.path;
	}
	this.updateManualOrderAfterRename(oldPath, file.path);
} else if (file instanceof TFolder) {
	this.updateFolderPathState(oldPath, file.path);
	this.fileIndex.renameFolder(oldPath, file.path);
	this.updateManualOrderAfterRename(oldPath, file.path);
}
this.scheduleRebuild();
```

Delete the duplicated in-place manual-order mutations. Retain the local `renameNestedPath` helper because `updateFolderPathState` still uses it for expanded and selected folder UI state.

- [ ] **Step 7: Run focused and full manual-order tests**

Run:

```bash
npm test -- --runInBand \
  src/explorer/__tests__/manualOrder.test.ts \
  src/explorer/__tests__/SmartExplorerView.test.ts \
  src/explorer/__tests__/viewMode.test.ts
```

Expected: all tests pass. The saved order contains every indexed file exactly once, hidden extensions retain their position, and rename schedules persistence.

- [ ] **Step 8: Commit the complete-order and rename fix**

```bash
git add \
  src/explorer/manualOrder.ts \
  src/explorer/SmartExplorerView.ts \
  src/explorer/__tests__/manualOrder.test.ts \
  src/explorer/__tests__/SmartExplorerView.test.ts
git commit -m "fix: preserve manual order across filters and renames"
```

---

### Task 3: Remove the search-clear debounce race

**Files:**

- Create: `src/explorer/searchRenderScheduler.ts`
- Create: `src/explorer/__tests__/searchRenderScheduler.test.ts`
- Modify: `src/explorer/SmartExplorerView.ts:80,153-189,326-331,437-515`
- Modify: `src/explorer/__tests__/SmartExplorerView.test.ts`

- [ ] **Step 1: Write scheduler tests with fake timers**

Create `searchRenderScheduler.test.ts`:

```ts
import { SearchRenderScheduler } from "../searchRenderScheduler";

describe("SearchRenderScheduler", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("runs only the latest scheduled render", () => {
		const scheduler = new SearchRenderScheduler();
		const first = jest.fn();
		const second = jest.fn();

		scheduler.schedule(first);
		scheduler.schedule(second);
		jest.advanceTimersByTime(200);

		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledTimes(1);
	});

	it("does not run a cancelled render", () => {
		const scheduler = new SearchRenderScheduler();
		const render = jest.fn();

		scheduler.schedule(render);
		scheduler.cancel();
		jest.advanceTimersByTime(200);

		expect(render).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Add a view-level clear-state regression**

Extend `SmartExplorerView.test.ts`:

```ts
describe("SmartExplorerView search state", () => {
	it("cancels a pending search render before clearing filters", () => {
		const view = Object.create(SmartExplorerView.prototype) as any;
		view.query = {
			searchText: "stale",
			sort: "name-asc",
			group: "none",
			extension: "md",
			fileKind: "markdown",
			modifiedWithinDays: 7,
		};
		view.searchRenderScheduler = { cancel: jest.fn() };
		view.rebuildView = jest.fn();

		view.clearSearchAndFilters();

		expect(view.searchRenderScheduler.cancel).toHaveBeenCalledTimes(1);
		expect(view.query).toMatchObject({
			searchText: "",
			extension: null,
			fileKind: "all",
			modifiedWithinDays: null,
		});
		expect(view.rebuildView).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 3: Run the new tests and confirm they fail**

Run:

```bash
npm test -- --runInBand \
  src/explorer/__tests__/searchRenderScheduler.test.ts \
  src/explorer/__tests__/SmartExplorerView.test.ts
```

Expected: `SearchRenderScheduler` and the new view field do not exist.

- [ ] **Step 4: Implement the cancellable scheduler**

Create `searchRenderScheduler.ts`:

```ts
const SEARCH_RENDER_DELAY_MS = 200;

export class SearchRenderScheduler {
	private timer: ReturnType<typeof setTimeout> | null = null;

	schedule(render: () => void) {
		this.cancel();
		this.timer = globalThis.setTimeout(() => {
			this.timer = null;
			render();
		}, SEARCH_RENDER_DELAY_MS);
	}

	cancel() {
		if (this.timer === null) return;
		globalThis.clearTimeout(this.timer);
		this.timer = null;
	}
}
```

- [ ] **Step 5: Make query state immediate and debounce only rendering**

In `SmartExplorerView`:

```ts
private searchRenderScheduler = new SearchRenderScheduler();
```

Remove `searchTimeout`. Replace the search input handler with:

```ts
searchInput.addEventListener("input", () => {
	this.query.searchText = searchInput.value;
	this.searchRenderScheduler.schedule(() => this.renderList());
});
```

At the start of the clear path:

```ts
private clearSearchAndFilters() {
	this.searchRenderScheduler.cancel();
	this.query = clearSearchAndFilters(this.query);
	this.rebuildView();
}
```

In the Escape branch, cancel before clearing:

```ts
if (this.query.searchText) {
	e.preventDefault();
	this.searchRenderScheduler.cancel();
	this.query.searchText = "";
	if (this.searchInput) this.searchInput.value = "";
	this.renderList();
	return;
}
```

In `onClose`, call:

```ts
this.searchRenderScheduler.cancel();
```

and remove the old `searchTimeout` cleanup.

- [ ] **Step 6: Run the search-focused tests**

Run:

```bash
npm test -- --runInBand \
  src/explorer/__tests__/searchRenderScheduler.test.ts \
  src/explorer/__tests__/SmartExplorerView.test.ts \
  src/explorer/__tests__/filterState.test.ts
```

Expected: all pass; clearing or closing cannot allow an old search callback to restore query text.

- [ ] **Step 7: Commit the search-state fix**

```bash
git add \
  src/explorer/searchRenderScheduler.ts \
  src/explorer/SmartExplorerView.ts \
  src/explorer/__tests__/searchRenderScheduler.test.ts \
  src/explorer/__tests__/SmartExplorerView.test.ts
git commit -m "fix: cancel stale search renders"
```

---

### Task 4: Make “Reveal active file” honor its goal

**Files:**

- Modify: `src/explorer/SmartExplorerView.ts:1078-1090`
- Modify: `src/explorer/__tests__/SmartExplorerView.test.ts`

- [ ] **Step 1: Add a filtered-reveal regression test**

Extend `SmartExplorerView.test.ts`:

```ts
describe("SmartExplorerView reveal state", () => {
	it("clears blocking filters and switches to tree mode before reveal", () => {
		const view = Object.create(SmartExplorerView.prototype) as any;
		view.app = {
			workspace: {
				getActiveFile: () => ({ path: "notes/active.md" }),
			},
		};
		view.query = {
			searchText: "other",
			sort: "modified-new",
			group: "folder",
			extension: null,
			fileKind: "images",
			modifiedWithinDays: 1,
		};
		view.viewMode = "list";
		view.selectedPath = null;
		view.selectedFolderPath = "notes";
		view.treeExpandedPaths = new Set<string>();
		view.searchRenderScheduler = { cancel: jest.fn() };
		view.rebuildView = jest.fn();
		view.listContainer = null;

		view.revealActiveFile();

		expect(view.searchRenderScheduler.cancel).toHaveBeenCalledTimes(1);
		expect(view.query).toMatchObject({
			searchText: "",
			sort: "modified-new",
			group: "folder",
			extension: null,
			fileKind: "all",
			modifiedWithinDays: null,
		});
		expect(view.viewMode).toBe("tree");
		expect(view.selectedPath).toBe("notes/active.md");
		expect(view.selectedFolderPath).toBeNull();
		expect(view.treeExpandedPaths).toContain("notes");
		expect(view.rebuildView).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 2: Run the regression and confirm it fails**

Run:

```bash
npm test -- --runInBand src/explorer/__tests__/SmartExplorerView.test.ts
```

Expected: query filters remain active and `rebuildView` is not called.

- [ ] **Step 3: Clear display filters and rebuild once before scrolling**

Replace `revealActiveFile` with:

```ts
revealActiveFile() {
	const activeFile = this.app.workspace.getActiveFile();
	if (!activeFile) return;

	this.searchRenderScheduler.cancel();
	this.query = clearSearchAndFilters(this.query);
	this.selectedPath = activeFile.path;
	this.selectedFolderPath = null;
	this.expandFolderAncestors(getParentFolderPath(activeFile.path));
	this.viewMode = "tree";
	this.rebuildView();

	if (
		this.listContainer &&
		!revealPathInContainer(this.listContainer, activeFile.path)
	) {
		new Notice("Active file is hidden by the explorer settings.");
	}
}
```

This preserves sort/group defaults, clears only transient search/type/date/extension filters, and gives feedback if the persistent hidden-extension setting still excludes the file.

- [ ] **Step 4: Run reveal, filter, and path tests**

Run:

```bash
npm test -- --runInBand \
  src/explorer/__tests__/SmartExplorerView.test.ts \
  src/explorer/__tests__/filterState.test.ts \
  src/explorer/__tests__/revealPath.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit the reveal fix**

```bash
git add \
  src/explorer/SmartExplorerView.ts \
  src/explorer/__tests__/SmartExplorerView.test.ts
git commit -m "fix: clear blocking filters when revealing files"
```

---

### Task 5: Remove quadratic tree-node lookup

**Files:**

- Modify: `src/explorer/TreeModel.ts:102-118`
- Modify: `src/explorer/__tests__/TreeModel.test.ts`

- [ ] **Step 1: Add a focused sorter test**

Export a new `sortTreeFileNodes` helper and add this test:

```ts
import {
	buildTree,
	sortTreeFileNodes,
} from "../TreeModel";
import type {
	ExplorerTreeFileNode,
	ExplorerTreeFolderNode,
	ExplorerTreeNode,
} from "../TreeModel";

it("sorts file nodes without losing node identity", () => {
	const oldNode: ExplorerTreeFileNode = {
		type: "file",
		id: "notes/old.md",
		name: "old",
		path: "notes/old.md",
		record: makeRecord("notes/old.md", { mtime: 1000 }),
		depth: 1,
	};
	const newNode: ExplorerTreeFileNode = {
		type: "file",
		id: "notes/new.md",
		name: "new",
		path: "notes/new.md",
		record: makeRecord("notes/new.md", { mtime: 3000 }),
		depth: 1,
	};

	const result = sortTreeFileNodes(
		[oldNode, newNode],
		"modified-new",
	);

	expect(result).toEqual([newNode, oldNode]);
	expect(result[0]).toBe(newNode);
	expect(result[1]).toBe(oldNode);
});
```

- [ ] **Step 2: Run the focused test and confirm the helper is missing**

Run:

```bash
npm test -- --runInBand src/explorer/__tests__/TreeModel.test.ts
```

Expected: compilation fails because `sortTreeFileNodes` is not exported.

- [ ] **Step 3: Implement path-indexed lookup**

Add:

```ts
export function sortTreeFileNodes(
	nodes: ExplorerTreeFileNode[],
	sort: Exclude<SortMode, "manual">,
	manualOrderIndex?: Map<string, number>,
): ExplorerTreeFileNode[] {
	const nodesByPath = new Map(nodes.map((node) => [node.path, node]));
	return sortRecords(
		nodes.map((node) => node.record),
		sort,
		manualOrderIndex,
	).map((record) => nodesByPath.get(record.path)!);
}
```

Then replace the repeated `children.find` expression:

```ts
const fileNodes = children.filter(
	(child): child is ExplorerTreeFileNode => child.type === "file",
);
const files = sortTreeFileNodes(fileNodes, sort, manualOrderIndex);
```

The lookup phase becomes `O(n)` after the existing `O(n log n)` sort.

- [ ] **Step 4: Run tree-model tests**

Run:

```bash
npm test -- --runInBand src/explorer/__tests__/TreeModel.test.ts
```

Expected: all tree construction, filtering, empty-folder, and sorting tests pass.

- [ ] **Step 5: Run a non-gating local performance comparison**

Build the source helper and measure large flat folders:

```bash
node_modules/.bin/esbuild \
  src/explorer/TreeModel.ts \
  --bundle \
  --platform=node \
  --format=cjs \
  --outfile=/tmp/smart-explorer-tree-model.cjs

node -e 'const {buildTree}=require("/tmp/smart-explorer-tree-model.cjs"); const q={searchText:"",sort:"name-asc",group:"none",extension:null,fileKind:"all",modifiedWithinDays:null}; for(const n of [8000,16000,32000]){const records=Array.from({length:n},(_,i)=>({path:`folder/file-${String(i).padStart(5,"0")}.md`,basename:`file-${String(i).padStart(5,"0")}`,extension:"md",parentPath:"folder",size:1,ctime:1,mtime:1,isMarkdown:true,isAttachment:false,tags:[]})); const start=performance.now(); buildTree(records,q); console.log(`${n}: ${(performance.now()-start).toFixed(1)}ms`);}'
```

Expected: growth is dominated by sorting rather than the previous quadratic lookup; 32,000 records should no longer take multiple seconds on the same machine used for the baseline.

- [ ] **Step 6: Commit the performance fix**

```bash
git add src/explorer/TreeModel.ts src/explorer/__tests__/TreeModel.test.ts
git commit -m "perf: avoid quadratic tree node lookup"
```

---

### Task 6: Make lint, build, and tests one required verification gate

**Files:**

- Modify: `package.json:7-13`
- Modify: `.github/workflows/ci.yml:20-24`
- Modify: `README.md:68-76`
- Modify: `AGENTS.md:9-16`
- Modify: `CLAUDE.md:9-16`

- [ ] **Step 1: Add the shared verify script**

Update `package.json` scripts:

```json
{
	"dev": "node esbuild.config.mjs",
	"build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
	"version": "node version-bump.mjs && git add manifest.json versions.json",
	"lint": "eslint .",
	"test": "node --experimental-vm-modules node_modules/.bin/jest",
	"verify": "npm run lint && npm run build && npm test -- --runInBand"
}
```

- [ ] **Step 2: Use `verify` in CI**

Replace separate build/test steps in `ci.yml`:

```yaml
      - run: npm ci

      - run: npm run verify
```

This makes the required `verify` job enforce the Obsidian ESLint rules as well as compilation and tests.

- [ ] **Step 3: Document the command**

Add this line alongside the existing development commands in `README.md`, `AGENTS.md`, and `CLAUDE.md`:

```bash
npm run verify    # lint + production build + all tests
```

- [ ] **Step 4: Run the shared gate**

Run:

```bash
npm run verify
```

Expected: lint exits with zero errors, production build succeeds, and all Jest suites pass.

- [ ] **Step 5: Commit the unified verification gate**

```bash
git add \
  package.json \
  .github/workflows/ci.yml \
  README.md \
  AGENTS.md \
  CLAUDE.md
git commit -m "chore: enforce lint in the verification gate"
```

---

### Task 7: Prevent accidental or off-main releases

**Files:**

- Create: `scripts/validate-release.mjs`
- Create: `scripts/__tests__/validate-release.test.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/release.yml:3-49`

- [ ] **Step 1: Write release metadata validator tests**

Create `scripts/__tests__/validate-release.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { validateReleaseMetadata } from "../validate-release.mjs";

const valid = {
	packageVersion: "0.5.1",
	manifestVersion: "0.5.1",
	minAppVersion: "1.7.2",
	versions: { "0.5.1": "1.7.2" },
};

test("accepts matching release metadata", () => {
	assert.doesNotThrow(() => validateReleaseMetadata("0.5.1", valid));
});

test("rejects a non-semver tag", () => {
	assert.throws(
		() => validateReleaseMetadata("test-0.5.1", valid),
		/semantic version/,
	);
});

test("rejects package and manifest version mismatches", () => {
	assert.throws(
		() => validateReleaseMetadata("0.5.1", {
			...valid,
			manifestVersion: "0.5.0",
		}),
		/package.json and manifest.json/,
	);
});

test("rejects a missing versions entry", () => {
	assert.throws(
		() => validateReleaseMetadata("0.5.1", {
			...valid,
			versions: {},
		}),
		/versions.json/,
	);
});

test("rejects a mismatched minimum app version", () => {
	assert.throws(
		() => validateReleaseMetadata("0.5.1", {
			...valid,
			versions: { "0.5.1": "1.8.0" },
		}),
		/minimum app version/,
	);
});
```

- [ ] **Step 2: Run the Node test and confirm the module is missing**

Run:

```bash
node --test scripts/__tests__/validate-release.test.mjs
```

Expected: failure with `ERR_MODULE_NOT_FOUND` for `validate-release.mjs`.

- [ ] **Step 3: Implement the release metadata validator**

Create `scripts/validate-release.mjs`:

```js
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function validateReleaseMetadata(tag, metadata) {
	if (!/^\d+\.\d+\.\d+$/.test(tag)) {
		throw new Error(`Release tag "${tag}" must be a semantic version.`);
	}
	if (
		tag !== metadata.packageVersion ||
		tag !== metadata.manifestVersion
	) {
		throw new Error(
			"Release tag, package.json and manifest.json versions must match.",
		);
	}
	if (!(tag in metadata.versions)) {
		throw new Error(`versions.json is missing release "${tag}".`);
	}
	if (metadata.versions[tag] !== metadata.minAppVersion) {
		throw new Error(
			"versions.json minimum app version must match manifest.json.",
		);
	}
}

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

export function readReleaseMetadata() {
	const packageJson = readJson("package.json");
	const manifest = readJson("manifest.json");
	return {
		packageVersion: packageJson.version,
		manifestVersion: manifest.version,
		minAppVersion: manifest.minAppVersion,
		versions: readJson("versions.json"),
	};
}

const isMainModule =
	process.argv[1] !== undefined &&
	import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
	const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? "";
	try {
		validateReleaseMetadata(tag, readReleaseMetadata());
		console.log(`Release metadata validated for ${tag}.`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
```

- [ ] **Step 4: Add validator tests to the shared gate**

Add scripts:

```json
"test:release": "node --test scripts/__tests__/validate-release.test.mjs",
"verify": "npm run lint && npm run build && npm test -- --runInBand && npm run test:release"
```

- [ ] **Step 5: Harden the release workflow before publication**

Change checkout to:

```yaml
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
```

Replace the current build step with:

```yaml
      - name: Validate release metadata
        run: node scripts/validate-release.mjs "$GITHUB_REF_NAME"

      - name: Verify tagged commit belongs to main
        run: |
          git fetch --no-tags origin main:refs/remotes/origin/main
          if ! git merge-base --is-ancestor "$GITHUB_SHA" origin/main; then
            echo "::error::Tagged commit is not contained in origin/main."
            exit 1
          fi

      - name: Install dependencies
        run: npm ci

      - name: Verify plugin
        run: npm run verify
```

Keep publication and attestation after these gates. Continue using `GITHUB_REF_NAME` as the release title/tag instead of re-parsing `GITHUB_REF`.

- [ ] **Step 6: Run validator and full gate locally**

Run:

```bash
node scripts/validate-release.mjs 0.5.1
npm run verify
```

Expected:

```text
Release metadata validated for 0.5.1.
```

followed by successful lint, build, Jest, and release-validator tests.

Also prove invalid input fails:

```bash
node scripts/validate-release.mjs test-0.5.1
```

Expected: non-zero exit and `must be a semantic version`.

- [ ] **Step 7: Commit release safety**

```bash
git add \
  scripts/validate-release.mjs \
  scripts/__tests__/validate-release.test.mjs \
  package.json \
  .github/workflows/release.yml
git commit -m "chore: validate releases before publishing"
```

---

### Task 8: Full verification and manual Obsidian QA

**Files:**

- Review all changed files
- Do not add unrelated refactors

- [ ] **Step 1: Run the complete automated gate from a clean dependency state**

Run:

```bash
npm ci
npm run verify
```

Expected:

- ESLint: zero errors.
- TypeScript/esbuild production build: exit zero.
- Jest: all suites and tests pass.
- Node release-validator tests: all pass.

- [ ] **Step 2: Confirm no generated or unrelated files entered the diff**

Run:

```bash
git status --short
git diff --check
git diff --stat main...
```

Expected:

- Only files listed in this plan are changed.
- `git diff --check` prints nothing.
- `main.js` remains untracked/ignored as intended and is not committed.

- [ ] **Step 3: Manually verify manual-order invariants in Obsidian**

Use a test vault containing:

```text
a.md
b.md
c.md
d.md
config.json
folder/old.md
```

Verify:

1. Set manual order to `a, b, c, d, config`.
2. Search so only `c` and `d` are visible.
3. Drag `d` before `c`.
4. Clear search.
5. Confirm global order is `a, b, d, c, config`.
6. Hide `json`, enter manual mode, leave manual mode, then unhide `json`.
7. Confirm `config.json` retains its previous global position.
8. Rename `folder/old.md` to `folder/new.md`.
9. Reload the plugin.
10. Confirm the renamed file retains its manual position.

- [ ] **Step 4: Manually verify search and reveal behavior**

Verify:

1. Search for `a`.
2. Change it to `ab` and immediately click clear.
3. Wait at least 300ms.
4. Confirm the search box and actual query both remain empty.
5. Apply a query that excludes the active file.
6. Run `Smart Explorer: Reveal active file`.
7. Confirm transient filters clear, tree mode opens, ancestors expand, and the active row scrolls into view.
8. Hide the active file's extension in settings and repeat reveal.
9. Confirm the command shows the explicit hidden-setting notice instead of silently doing nothing.

- [ ] **Step 5: Review workflow logic in the pull request**

Confirm the PR's `verify` check runs lint, build, Jest, and release-validator tests. Do not test the release workflow by pushing a disposable tag; metadata and ancestry checks are covered by local tests plus workflow review, and actual tag creation is reserved for the normal release process.

- [ ] **Step 6: Push the branch and open a focused PR**

Push the branch created in Task 0:

```bash
git push -u origin fix/reliability-and-release-guards
```

PR title:

```text
fix: harden explorer state and release verification
```

PR body:

```markdown
## Summary

- preserve global manual order through filters, hidden extensions, and renames
- cancel stale search renders and make reveal active file clear blocking filters
- remove quadratic tree-node lookup
- enforce lint/build/tests in CI and validate releases before publication

## Verification

- `npm ci`
- `npm run verify`
- manual Obsidian checks for filtered drag, hidden extensions, rename persistence, search clearing, and reveal active file
```

Do not include AI attribution, generated-by text, or co-author trailers.

---

## Commit sequence

1. `docs: add reliability fix plan`
2. `fix: map filtered drag positions to manual order`
3. `fix: preserve manual order across filters and renames`
4. `fix: cancel stale search renders`
5. `fix: clear blocking filters when revealing files`
6. `perf: avoid quadratic tree node lookup`
7. `chore: enforce lint in the verification gate`
8. `chore: validate releases before publishing`

Each commit must pass its focused tests. The final branch must pass `npm run verify`.

## Completion criteria

- Manual order always contains each current `FileIndex` path exactly once.
- Hidden extensions and transient filters never remove paths from persisted order.
- Filtered drag changes visible relative order without moving across unrelated hidden anchors.
- File and folder rename updates are saved before reload.
- Clearing search cannot be undone by a stale timer.
- Reveal active file either shows the file or gives an explicit hidden-setting notice.
- Tree file-node lookup is path-indexed rather than quadratic.
- Required CI includes lint, build, Jest, and release-validator tests.
- Release publication rejects malformed/mismatched tags and commits not contained in `origin/main`.
- No unrelated behavior, settings, dependencies, or release version changes are introduced.
