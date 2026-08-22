# Smart Explorer Product and UX Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Smart Explorer fast, unambiguous, accessible, and reliable for large Obsidian vaults before adding narrowly scoped discovery features.

**Architecture:** Keep `FileIndex` as the single vault truth, move query/settings normalization into pure helpers, and split rendering into a lazy tree path and a keyed fixed-row-height list path. Use container focus plus `aria-activedescendant` so keyboard state survives list windowing, and run DOM-dependent tests only in explicitly marked jsdom suites with Obsidian DOM shims. Preserve the current product boundary: explicit create/rename/trash actions remain the only vault writes, manual order remains list-only, and no content database, preview system, network service, or full file-manager behavior is added.

**Tech Stack:** TypeScript, Obsidian API 1.13.x, DOM/ARIA, Jest with ts-jest, esbuild, ESLint, Node.js scripts, CSS container queries.

---

## Delivery strategy

Ship this work as four independently testable pull requests. Do not combine them into one release-sized diff.

Planning baseline on 2026-08-22: `main` is clean at version `0.5.4`; `npm run verify` passes 21 Jest suites / 132 tests and 6 release-validator tests.

| PR | Outcome | Release gate |
|---|---|---|
| 1. Correctness and narrow-pane clarity | DOM test foundation, search/filter semantics, truthful non-Markdown filtering, list path context, settings validation, live settings refresh | `npm run verify`; desktop light/dark QA in `/Users/Roger/my-vault` |
| 2. Keyboard and assistive technology | Correct list/tree semantics, container focus, truthful expanded states, keyboard manual reorder | Unit tests plus keyboard-only and VoiceOver smoke test |
| 3. Large-vault performance | Keyed windowed list, lazy tree DOM, cached tree counts, cheaper drag geometry | 1k/10k synthetic tests and 5k-file test-vault QA |
| 4. Lifecycle and integration hardening | Serialized saves, surfaced async failures, active-file sync, folder subtree deletion, integration harness | Event-to-index-to-DOM tests and close-flush failure tests |

Do not start PR 2 until PR 1 is merged. Do not start PR 3 until the final row structure and row heights from PR 1 are stable. PR 4 can start after PR 1, but should merge after PR 3 so its integration tests exercise the final renderers.

## Scope and file map

### Files to create

- `src/explorer/queryNormalization.ts`
  - Normalize search input once for both filter evaluation and active-state detection.
- `src/explorer/__tests__/queryNormalization.test.ts`
  - Cover whitespace, case folding, and non-mutating behavior.
- `src/test-utils/obsidianDom.ts`
  - Shim Obsidian DOM helpers and deterministic layout/rAF behavior for explicitly jsdom-based tests.
- `src/explorer/__tests__/SmartExplorerView.dom.test.ts`
  - Cover toolbar controls, tree mounting, composite focus, and DOM state without changing the default Node test environment.
- `src/explorer/__tests__/DragSortManager.dom.test.ts`
  - Cover cached layout geometry with deterministic element metrics.
- `src/settings/settings-normalization.ts`
  - Validate persisted settings and migrate missing `lastViewMode` safely.
- `src/settings/__tests__/settings-normalization.test.ts`
  - Cover corrupt enums, non-array manual order, duplicates, and extension normalization.
- `src/explorer/focusNavigation.ts`
  - Pure key-to-focus/action resolution for list and tree rows.
- `src/explorer/__tests__/focusNavigation.test.ts`
  - Cover Arrow/Home/End, folder open/close, activation, and keyboard reorder intent.
- `src/explorer/__tests__/VirtualList.test.ts`
  - Prove bounded DOM nodes, node reuse, scroll restoration, and cleanup.
- `src/explorer/__tests__/SmartExplorerView.integration.test.ts`
  - Exercise fake vault/workspace events through index, view state, and DOM.
- `scripts/prepare-large-vault-fixture.mjs`
  - Create and remove a marker-protected synthetic fixture inside an explicitly supplied test vault.
- `scripts/__tests__/prepare-large-vault-fixture.test.mjs`
  - Verify path guards and marker-protected cleanup.

### Files to modify

- `src/types.ts`
  - Remove unused stale metadata fields; retain the existing extension query.
- `src/explorer/FileIndex.ts`
  - Remove the stale attachment allowlist and unused metadata projection, maintain folder paths incrementally, and purge folder subtrees explicitly.
- `src/explorer/filters.ts`, `src/explorer/filterState.ts`
  - Share normalized search semantics.
- `src/explorer/fileRow.ts`
  - Add singular/plural file-count formatting.
- `src/explorer/TreeModel.ts`
  - Store file counts on folder/root nodes.
- `src/explorer/VirtualList.ts`
  - Replace rebuild-per-window rendering with keyed node reuse and a reachable threshold.
- `src/explorer/DragSortManager.ts`
  - Cache row offsets at drag start instead of measuring every row on every pointer event.
- `src/explorer/SmartExplorerView.ts`
  - Add the extension control, consistent empty states, list context rows, lazy tree children, ARIA/keyboard behavior, direct drag registration, settings refresh, active-file sync, and async error feedback.
- `src/settings/settings.ts`, `src/settings/settings-tab.ts`, `src/main.ts`
  - Add validated loading, `lastViewMode`, serialized persistence, and live view refresh.
- `styles.css`
  - Style two-line list rows, selected folders, focus-visible states, live-region-safe UI, and windowed content.
- `package.json`, `package-lock.json`
  - Add the Jest 29 jsdom environment while keeping Node as the default for existing pure tests.
- Existing tests under `src/explorer/__tests__`, `src/settings/__tests__`, and `src/__tests__`
  - Extend focused regression coverage without replacing current tests.
- `README.md`, `AGENTS.md`, `CLAUDE.md`
  - Document the final renderer behavior, test-vault boundary, and verification commands after implementation.

### Deliberately deferred

- Content preview, backlinks, graph features, full-text indexing, and AI search.
- Saved views and a query DSL.
- Cross-folder move, bulk edit, tag editing, trash management, and other full file-manager features.
- Tree manual ordering and grouped manual ordering.
- Tag/heading search until P0/P1 are shipped and a live `metadataCache.on("changed")` design has its own reviewed plan.

---

## PR 1 — Correctness and narrow-pane clarity

### Task 0: Add explicit DOM test infrastructure

**Files:**

- Create: `src/test-utils/obsidianDom.ts`
- Create: `src/explorer/__tests__/SmartExplorerView.dom.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install the Jest 29 jsdom environment without changing the global environment**

Run:

```bash
npm install --save-dev jest-environment-jsdom@^29.7.0
```

Expected: `package.json` and `package-lock.json` add `jest-environment-jsdom`; `jest.config.cjs` remains `testEnvironment: "node"` so existing pure tests keep their current runtime boundary.

- [ ] **Step 2: Add Obsidian DOM and deterministic-layout shims**

Create `src/test-utils/obsidianDom.ts`:

```ts
type TestElementInfo = {
	cls?: string | string[];
	text?: string;
	attr?: Record<string, string>;
};

function applyInfo(element: HTMLElement, info?: TestElementInfo | string): void {
	if (typeof info === "string") {
		element.className = info;
		return;
	}
	if (!info) return;
	if (info.cls) {
		const classes = Array.isArray(info.cls) ? info.cls : info.cls.split(/\s+/);
		element.classList.add(...classes.filter(Boolean));
	}
	if (info.text !== undefined) element.textContent = info.text;
	for (const [name, value] of Object.entries(info.attr ?? {})) {
		element.setAttribute(name, value);
	}
}

function createTestElement<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	info?: TestElementInfo | string,
): HTMLElementTagNameMap[K] {
	const element = document.createElement(tag);
	applyInfo(element, info);
	return element;
}

Object.defineProperties(HTMLElement.prototype, {
	empty: {
		configurable: true,
		value(this: HTMLElement) { this.replaceChildren(); },
	},
	setText: {
		configurable: true,
		value(this: HTMLElement, text: string) { this.textContent = text; },
	},
	createEl: {
		configurable: true,
		value<K extends keyof HTMLElementTagNameMap>(
			this: HTMLElement,
			tag: K,
			info?: TestElementInfo | string,
		) {
			const element = createTestElement(tag, info);
			this.appendChild(element);
			return element;
		},
	},
	createDiv: {
		configurable: true,
		value(this: HTMLElement, info?: TestElementInfo | string) {
			return this.createEl("div", info);
		},
	},
	createSpan: {
		configurable: true,
		value(this: HTMLElement, info?: TestElementInfo | string) {
			return this.createEl("span", info);
		},
	},
});

Object.assign(globalThis, {
	activeDocument: document,
	createEl: createTestElement,
	createDiv: (info?: TestElementInfo | string) => createTestElement("div", info),
	createSpan: (info?: TestElementInfo | string) => createTestElement("span", info),
});

if (!window.requestAnimationFrame) {
	window.requestAnimationFrame = (callback) => window.setTimeout(
		() => callback(performance.now()),
		0,
	);
	window.cancelAnimationFrame = (id) => window.clearTimeout(id);
}

export function mockElementBox(
	element: HTMLElement,
	box: { top?: number; left?: number; width?: number; height?: number },
): void {
	const top = box.top ?? 0;
	const left = box.left ?? 0;
	const width = box.width ?? 0;
	const height = box.height ?? 0;
	Object.defineProperties(element, {
		clientHeight: { configurable: true, value: height },
		offsetHeight: { configurable: true, value: height },
		offsetTop: { configurable: true, value: top },
	});
	element.getBoundingClientRect = () => ({
		x: left,
		y: top,
		top,
		left,
		right: left + width,
		bottom: top + height,
		width,
		height,
		toJSON: () => ({}),
	});
}
```

- [ ] **Step 3: Add a DOM-environment smoke test**

Start `SmartExplorerView.dom.test.ts` with:

```ts
/** @jest-environment jsdom */

import "../../test-utils/obsidianDom";
import { mockElementBox } from "../../test-utils/obsidianDom";

describe("Obsidian DOM test foundation", () => {
	it("provides Obsidian helpers and deterministic layout metrics", () => {
		const parent = document.createElement("div");
		const child = parent.createDiv({ cls: "child", text: "Hello" });
		mockElementBox(child, { top: 44, width: 300, height: 44 });

		expect(parent.querySelector(".child")?.textContent).toBe("Hello");
		expect(child.offsetTop).toBe(44);
		expect(child.getBoundingClientRect().bottom).toBe(88);

		parent.empty();
		expect(parent.childElementCount).toBe(0);
	});
});
```

- [ ] **Step 4: Run Node and jsdom suites together**

Run:

```bash
npm test -- --runInBand src/explorer/__tests__/filters.test.ts src/explorer/__tests__/SmartExplorerView.dom.test.ts
```

Expected: the existing Node suite and new jsdom suite both pass without changing `jest.config.cjs`.

- [ ] **Step 5: Commit the test foundation**

```bash
git add package.json package-lock.json src/test-utils/obsidianDom.ts src/explorer/__tests__/SmartExplorerView.dom.test.ts
git commit -m "test: add explorer DOM test foundation"
```

### Task 1: Normalize search and replace ambiguous attachment semantics

**Files:**

- Create: `src/explorer/queryNormalization.ts`
- Create: `src/explorer/__tests__/queryNormalization.test.ts`
- Modify: `src/explorer/filters.ts:1-36`
- Modify: `src/explorer/filterState.ts:1-20`
- Modify: `src/explorer/FileIndex.ts:1-52`
- Modify: `src/explorer/__tests__/filters.test.ts`
- Modify: `src/explorer/__tests__/FileIndex.test.ts`
- Modify: `src/types.ts:19-45`

- [ ] **Step 1: Add failing normalization and non-Markdown filter tests**

Create `queryNormalization.test.ts`:

```ts
import { normalizeSearchText } from "../queryNormalization";

describe("normalizeSearchText", () => {
	it("trims and case-folds once at the query boundary", () => {
		expect(normalizeSearchText("  Projects/ALPHA  ")).toBe("projects/alpha");
	});

	it("normalizes whitespace-only input to an empty query", () => {
		expect(normalizeSearchText("   \t ")).toBe("");
	});
});
```

Add to `filters.test.ts`:

```ts
it("does not hide every file for whitespace-only search", () => {
	const query = { ...baseQuery, searchText: "   " };
	expect(applyFilters(records, query)).toEqual(records);
});
```

Add to `filters.test.ts`:

```ts
it("treats every non-Markdown format as Non-Markdown without calling it an attachment", () => {
	const records = ["note.md", "board.canvas", "table.base", "document.docx", "data.csv"]
		.map(makeRecord);
	const result = applyFilters(records, { ...baseQuery, fileKind: "non-markdown" });
	expect(result.map((record) => record.path)).toEqual([
		"board.canvas",
		"table.base",
		"document.docx",
		"data.csv",
	]);
});
```

- [ ] **Step 2: Run the focused tests and verify the regressions fail**

Run:

```bash
npm test -- --runInBand src/explorer/__tests__/queryNormalization.test.ts src/explorer/__tests__/filters.test.ts src/explorer/__tests__/FileIndex.test.ts
```

Expected: the new module and `non-markdown` kind are missing, and whitespace search returns no records.

- [ ] **Step 3: Add the shared normalization helper**

Create `queryNormalization.ts`:

```ts
export function normalizeSearchText(value: string): string {
	return value.trim().toLocaleLowerCase();
}
```

Use it in both `filters.ts` and `filterState.ts`:

```ts
const searchText = normalizeSearchText(query.searchText);
if (searchText) {
	result = result.filter((record) =>
		record.basename.toLocaleLowerCase().includes(searchText) ||
		record.path.toLocaleLowerCase().includes(searchText),
	);
}
```

```ts
normalizeSearchText(query.searchText).length > 0
```

- [ ] **Step 4: Remove attachment classification and the unused metadata projection**

Change `FileKind` and remove `isAttachment` from `FileRecord`:

```ts
export type FileKind = "all" | "markdown" | "non-markdown" | "images";
```

Delete `ATTACHMENT_EXTENSIONS`, `isAttachment`, and the `isAttachment` assignment from `FileIndex.ts`. Filter the new kind directly from the canonical Markdown flag:

```ts
if (query.fileKind === "non-markdown") {
	result = result.filter((record) => !record.isMarkdown);
}
```

Use the UI label `Non-Markdown`; `.canvas` and `.base` are intentionally included because the filter describes file format rather than claiming those Obsidian document formats are attachments.

Remove `frontmatter`, `tags`, and `firstHeading` from `FileRecord`, remove their population from `normalizeFileRecord`, and keep the `MetadataCache | null` parameter temporarily so this change does not widen the call-site diff. Rename it to `_cache` to satisfy lint:

```ts
export function normalizeFileRecord(
	file: TFile,
	_cache: MetadataCache | null,
): FileRecord {
```

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
npm test -- --runInBand src/explorer/__tests__/queryNormalization.test.ts src/explorer/__tests__/filters.test.ts src/explorer/__tests__/filterState.test.ts src/explorer/__tests__/FileIndex.test.ts
npm run lint
```

Expected: all focused tests and lint pass. `normalizeFileRecord` no longer calls `metadataCache.getFileCache`, which becomes the first measurable indexing improvement for large vaults.

Commit:

```bash
git add src/types.ts src/explorer/FileIndex.ts src/explorer/filters.ts src/explorer/filterState.ts src/explorer/queryNormalization.ts src/explorer/__tests__
git commit -m "fix: normalize explorer filters"
```

### Task 2: Expose the existing extension filter and make filter state truthful

**Files:**

- Modify: `src/explorer/SmartExplorerView.ts:65-76,252-456,563-671`
- Modify: `src/explorer/__tests__/SmartExplorerView.dom.test.ts`
- Modify: `styles.css:17-151,318-327`

- [ ] **Step 1: Add failing tests for dynamic extension options and toggle state**

Add to the jsdom-backed `SmartExplorerView.dom.test.ts`; do not move the existing Node tests into jsdom. Use a prototype-only view with a real select element:

```ts
it("builds sorted extension options from visible records", () => {
	const view = Object.create(SmartExplorerView.prototype) as any;
	view.extensionSelect = document.createElement("select");
	view.query = { extension: "pdf" };
	view.syncExtensionOptions([
		makeRecord("note.md"),
		makeRecord("image.png"),
		makeRecord("document.pdf"),
	]);

expect(Array.from(view.extensionSelect.options).map((option: HTMLOptionElement) => [
	option.value,
	option.text,
])).toEqual([
	["", "All extensions"],
	["md", ".md"],
	["pdf", ".pdf"],
	["png", ".png"],
]);
});

it("keeps filter disclosure name and expanded state truthful", () => {
	const view = Object.create(SmartExplorerView.prototype) as any;
	const button = document.createElement("button");
	const panel = document.createElement("div");
	panel.classList.add("is-collapsed");

	view.updateDisclosureButton(button, panel, "filters", false);
	expect(button.getAttribute("aria-expanded")).toBe("false");
	expect(button.getAttribute("aria-label")).toBe("Show filters");

	panel.classList.remove("is-collapsed");
	view.updateDisclosureButton(button, panel, "filters", false);
	expect(button.getAttribute("aria-expanded")).toBe("true");
	expect(button.getAttribute("aria-label")).toBe("Hide filters");
});
```

- [ ] **Step 2: Verify the tests fail**

Run:

```bash
npm test -- --runInBand src/explorer/__tests__/SmartExplorerView.dom.test.ts
```

Expected: `extensionSelect` and truthful expanded-state behavior do not exist.

- [ ] **Step 3: Add a labeled dynamic extension select**

Add the property:

```ts
private extensionSelect: HTMLSelectElement | null = null;
```

Extend `createSelect` with an explicit label:

```ts
private createSelect(
	parent: HTMLElement,
	options: { value: string; text: string }[],
	cls: string,
	ariaLabel: string,
	onChange: (value: string) => void,
	value?: string,
) {
	const select = parent.createEl("select", { cls });
	select.setAttribute("aria-label", ariaLabel);
	for (const option of options) {
		select.createEl("option", { value: option.value, text: option.text });
	}
	if (value !== undefined) select.value = value;
	select.addEventListener("change", () => onChange(select.value));
	return select;
}
```

Create the extension control after file kind:

```ts
this.extensionSelect = this.createSelect(
	filterRow,
	[{ value: "", text: "All extensions" }],
	"smart-explorer-extension",
	"File extension",
	(value) => {
		this.query.extension = value || null;
		this.renderList();
	},
	this.query.extension ?? "",
);
```

Update existing select calls with `Sort order`, `Group files`, `File kind`, and `Modified date` labels.

- [ ] **Step 4: Synchronize extension options from the current visible projection**

Add:

```ts
private syncExtensionOptions(records: FileRecord[]): void {
	if (!this.extensionSelect) return;
	const selected = this.query.extension ?? "";
	const extensions = Array.from(new Set(records.map((record) => record.extension)))
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
	this.extensionSelect.replaceChildren();
	this.extensionSelect.createEl("option", { value: "", text: "All extensions" });
	for (const extension of extensions) {
		this.extensionSelect.createEl("option", { value: extension, text: `.${extension}` });
	}
	if (selected && !extensions.includes(selected)) {
		this.query.extension = null;
	}
	this.extensionSelect.value = this.query.extension ?? "";
}
```

Call `syncExtensionOptions(records)` after applying hidden extensions and before building sections. Do not reset `query.extension` when file kind changes; the two filters should compose.

- [ ] **Step 5: Centralize search/filter toggle state**

Add:

```ts
private updateDisclosureButton(
	button: HTMLButtonElement | null,
	panel: HTMLElement | null,
	label: string,
	active: boolean,
): void {
	if (!button || !panel) return;
	const expanded = !panel.classList.contains("is-collapsed");
	button.setAttribute("aria-expanded", String(expanded));
	button.setAttribute("aria-label", `${expanded ? "Hide" : "Show"} ${label}`);
	button.classList.toggle("is-active", expanded || active);
}
```

Give every view instance a unique ID prefix rather than fixed document IDs:

```ts
let nextExplorerViewInstanceId = 0;

export class SmartExplorerView extends ItemView {
	private readonly domIdPrefix = `smart-explorer-${++nextExplorerViewInstanceId}`;

	private get searchPanelId(): string {
		return `${this.domIdPrefix}-search`;
	}

	private get filterPanelId(): string {
		return `${this.domIdPrefix}-filters`;
	}
}
```

Assign those IDs to the panels, set matching `aria-controls` on the buttons, and add a two-view DOM test asserting all four panel IDs are unique. Call `updateDisclosureButton` from toggle handlers, `updateFileCount`, Escape handling, and `rebuildView`.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm test -- --runInBand src/explorer/__tests__/SmartExplorerView.dom.test.ts src/explorer/__tests__/filters.test.ts
npm run build
```

Expected: extension selection composes with kind/date/search filters, and both disclosure buttons expose truthful labels and expanded states.

Commit:

```bash
git add src/explorer/SmartExplorerView.ts src/explorer/__tests__/SmartExplorerView.dom.test.ts styles.css
git commit -m "feat: expose extension filtering"
```

### Task 3: Preserve file context in narrow list view and fix visible state details

**Files:**

- Modify: `src/explorer/fileRow.ts`
- Modify: `src/explorer/__tests__/fileRow.test.ts`
- Modify: `src/explorer/SmartExplorerView.ts:563-681,790-904,931-944,1489-1500`
- Modify: `styles.css:160-323,329-368`

- [ ] **Step 1: Add failing count-format tests**

```ts
import { formatFileCount, formatVisibleFileCount } from "../fileRow";

it("uses singular grammar", () => {
	expect(formatFileCount(1)).toBe("1 file");
});

it("formats filtered totals", () => {
	expect(formatVisibleFileCount(2, 10)).toBe("2 of 10 files");
});
```

- [ ] **Step 2: Implement count helpers**

```ts
export function formatFileCount(count: number): string {
	return `${count} ${count === 1 ? "file" : "files"}`;
}

export function formatVisibleFileCount(displayed: number, total: number): string {
	return displayed === total
		? formatFileCount(total)
		: `${displayed} of ${formatFileCount(total)}`;
}
```

Use `formatFileCount(node.fileCount)` for folders and `formatVisibleFileCount` for the toolbar count.

- [ ] **Step 3: Render a stable two-line identity block in list mode**

Replace the name/meta construction inside `createRowElement` with:

```ts
const identity = row.createSpan({ cls: "smart-explorer-row-identity" });
if (this.inlineEdit?.kind === "rename-file" && this.inlineEdit.path === record.path) {
	identity.appendChild(this.createInlineEditInput(this.inlineEdit.value, "File name"));
} else {
	identity.createSpan({ cls: "smart-explorer-row-name", text: record.basename });
}
const meta = identity.createSpan({ cls: "smart-explorer-row-meta" });
meta.createSpan({ cls: "smart-explorer-row-parent", text: formatFileParent(record.parentPath) });
meta.createSpan({ cls: "smart-explorer-row-date", text: formatFileModifiedDate(record.mtime) });
```

In `renderListContent`, toggle `.is-tree-view` and `.is-list-view` on `listContainer` from the resolved mode.

- [ ] **Step 4: Add narrow-pane CSS and selected-folder feedback**

```css
.smart-explorer-row-identity {
	display: flex;
	flex: 1 1 auto;
	min-width: 0;
}

.smart-explorer-list.is-list-view .smart-explorer-row {
	min-height: 44px;
}

.smart-explorer-list.is-list-view .smart-explorer-row-identity {
	flex-direction: column;
	gap: 1px;
}

.smart-explorer-list.is-list-view .smart-explorer-row-meta {
	display: flex;
	min-width: 0;
}

.smart-explorer-list.is-list-view .smart-explorer-row-parent {
	flex: 1 1 auto;
	min-width: 0;
}

.smart-explorer-list.is-list-view .smart-explorer-row-date {
	display: none;
}

body.is-phone .smart-explorer-list.is-list-view .smart-explorer-row,
body.is-tablet .smart-explorer-list.is-list-view .smart-explorer-row {
	min-height: 52px;
}

@container (min-width: 420px) {
	.smart-explorer-list.is-list-view .smart-explorer-row-date {
		display: inline;
	}
}

.smart-explorer-tree-folder-summary.is-selected {
	background: var(--interactive-accent);
	color: var(--text-on-accent);
}

.smart-explorer-row:focus-visible,
.smart-explorer-tree-folder-summary:focus-visible {
	outline: 2px solid var(--interactive-accent);
	outline-offset: -2px;
}
```

Remove the old rule that hides all row metadata below 420px.

- [ ] **Step 5: Distinguish empty-vault, hidden-all, and no-match states**

Implement these exact messages:

```ts
if (allRecords.length === 0 && folderPaths.length === 0 && !hasInlineCreate) {
	this.renderEmptyState("No files in vault.");
	return;
}
if (records.length === 0 && allRecords.length > 0 && !hasInlineCreate) {
	this.renderEmptyState("All files are hidden by extension settings.");
	return;
}
```

Keep the clear action only for `No files match the current search or filters.` Add `role="status"` to all empty-state containers.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm test -- --runInBand src/explorer/__tests__/fileRow.test.ts src/explorer/__tests__/SmartExplorerView.test.ts
npm run build
```

Manually verify tree and list modes at 300px, 420px, and 600px sidebar widths in both light and dark themes.

Commit:

```bash
git add src/explorer/fileRow.ts src/explorer/__tests__/fileRow.test.ts src/explorer/SmartExplorerView.ts src/explorer/__tests__/SmartExplorerView.test.ts styles.css
git commit -m "fix: preserve list path context"
```

### Task 4: Validate settings, refresh live views, and remember view mode

**Files:**

- Create: `src/settings/settings-normalization.ts`
- Create: `src/settings/__tests__/settings-normalization.test.ts`
- Modify: `src/settings/settings.ts`
- Modify: `src/settings/settings-tab.ts:50-121`
- Modify: `src/settings/__tests__/settings-tab.test.ts`
- Modify: `src/main.ts:8-84`
- Modify: `src/__tests__/main.test.ts`
- Modify: `src/explorer/SmartExplorerView.ts:56-109,252-264`

- [ ] **Step 1: Write failing normalization tests**

```ts
import { normalizeSettings } from "../settings-normalization";

describe("normalizeSettings", () => {
	it("rejects corrupt enums and arrays", () => {
		expect(normalizeSettings({
			defaultSort: "random",
			defaultGroup: 42,
			hiddenExtensions: "png",
			manualOrder: null,
			lastViewMode: "grid",
		})).toEqual({
			defaultSort: "name-asc",
			defaultGroup: "none",
			hiddenExtensions: [],
			manualOrder: [],
			lastViewMode: "tree",
		});
	});

	it("normalizes and deduplicates string arrays", () => {
		expect(normalizeSettings({
			hiddenExtensions: [".PNG", " png ", "CSS", 9],
			manualOrder: ["b.md", "a.md", "b.md", 9],
		})).toMatchObject({
			hiddenExtensions: ["png", "css"],
			manualOrder: ["b.md", "a.md"],
		});
	});
});
```

- [ ] **Step 2: Implement strict normalization**

Add `lastViewMode` to settings:

```ts
export type SmartExplorerSettings = {
	defaultSort: SortMode;
	defaultGroup: GroupMode;
	hiddenExtensions: string[];
	manualOrder: string[];
	lastViewMode: ViewMode;
};
```

Create `settings-normalization.ts` with enum sets and:

```ts
const SORT_MODES = new Set<SortMode>([
	"name-asc", "name-desc", "modified-new", "modified-old",
	"created-new", "created-old", "extension", "size", "manual",
]);
const GROUP_MODES = new Set<GroupMode>([
	"none", "folder", "extension", "modified-month", "top-folder",
]);
const VIEW_MODES = new Set<ViewMode>(["tree", "list"]);

function uniqueStrings(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return Array.from(new Set(value.filter((item): item is string => typeof item === "string")));
}

function normalizeExtensions(value: unknown): string[] {
	return Array.from(new Set(
		uniqueStrings(value)
			.map((extension) => extension.trim().toLocaleLowerCase().replace(/^\.+/, ""))
			.filter(Boolean),
	));
}

export function normalizeSettings(value: unknown): SmartExplorerSettings {
	const saved = value && typeof value === "object"
		? value as Record<string, unknown>
		: {};
	return {
		defaultSort: SORT_MODES.has(saved.defaultSort as SortMode)
			? saved.defaultSort as SortMode
			: DEFAULT_SETTINGS.defaultSort,
		defaultGroup: GROUP_MODES.has(saved.defaultGroup as GroupMode)
			? saved.defaultGroup as GroupMode
			: DEFAULT_SETTINGS.defaultGroup,
		hiddenExtensions: normalizeExtensions(saved.hiddenExtensions),
		manualOrder: uniqueStrings(saved.manualOrder),
		lastViewMode: VIEW_MODES.has(saved.lastViewMode as ViewMode)
			? saved.lastViewMode as ViewMode
			: DEFAULT_SETTINGS.lastViewMode,
	};
}
```

- [ ] **Step 3: Load normalized settings and expose live refresh**

In `main.ts`:

```ts
async loadSettings() {
	this.settings = normalizeSettings(await this.loadData());
}

refreshExplorerViews(): void {
	for (const leaf of this.app.workspace.getLeavesOfType(SMART_EXPLORER_VIEW_TYPE)) {
		if (leaf.view instanceof SmartExplorerView) leaf.view.refreshSettingsProjection();
	}
}
```

In `SmartExplorerView`, initialize `viewMode` from `settings.lastViewMode` only in the constructor. Persist a new value after that view's user-triggered toggle, but do not broadcast the mode change to other open leaves:

```ts
private setViewMode(viewMode: ViewMode): void {
	this.viewMode = viewMode;
	this.plugin.settings.lastViewMode = viewMode;
	void this.plugin.saveSettings().catch((error) => {
		new Notice(`Could not save view mode: ${error instanceof Error ? error.message : String(error)}`);
	});
	this.renderList();
}

refreshSettingsProjection(): void {
	this.renderList();
}
```

Do not replace the current view mode, query sort, or query group when settings refresh. `lastViewMode` is the default for the next view instance; already-open leaves remain independent. Hidden extensions and reset manual order update live because they change the shared displayed projection.

- [ ] **Step 4: Refresh open views after relevant settings changes**

After hidden-extension save and manual-order reset:

```ts
await this.plugin.saveSettings();
this.plugin.refreshExplorerViews();
```

Change the default sort/group descriptions to `Used when a new Smart Explorer view opens.` so users understand that existing views are unchanged.

- [ ] **Step 5: Verify and commit PR 1**

Run:

```bash
npm test -- --runInBand src/settings/__tests__ src/__tests__/main.test.ts src/explorer/__tests__/SmartExplorerView.test.ts src/explorer/__tests__/SmartExplorerView.dom.test.ts
npm run verify
```

Expected baseline plus new tests: all Jest suites, lint, build, and release tests pass.

Commit:

```bash
git add src/settings src/main.ts src/__tests__/main.test.ts src/explorer/SmartExplorerView.ts src/explorer/__tests__/SmartExplorerView.test.ts src/explorer/__tests__/SmartExplorerView.dom.test.ts
git commit -m "fix: validate and refresh explorer settings"
```

PR title: `fix: improve explorer correctness and narrow-pane clarity`

---

## PR 2 — Keyboard and assistive technology

### Task 5: Establish correct semantics with container-managed focus

**Files:**

- Create: `src/explorer/focusNavigation.ts`
- Create: `src/explorer/__tests__/focusNavigation.test.ts`
- Modify: `src/explorer/SmartExplorerView.ts:563-920,1489-1500`
- Modify: `src/explorer/__tests__/SmartExplorerView.test.ts`
- Modify: `src/explorer/__tests__/SmartExplorerView.dom.test.ts`
- Modify: `styles.css:236-275`

- [ ] **Step 1: Write failing pure navigation tests**

```ts
import { resolveFocusNavigation } from "../focusNavigation";

describe("resolveFocusNavigation", () => {
	it.each([
		["ArrowDown", 2, 5, 3],
		["ArrowUp", 2, 5, 1],
		["Home", 2, 5, 0],
		["End", 2, 5, 4],
	])("maps %s to the expected visible index", (key, current, count, index) => {
		expect(resolveFocusNavigation({ key, current, count, folderExpanded: null }))
			.toEqual({ type: "focus", index });
	});

	it("closes an expanded folder on ArrowLeft", () => {
		expect(resolveFocusNavigation({ key: "ArrowLeft", current: 1, count: 4, folderExpanded: true }))
			.toEqual({ type: "collapse" });
	});

	it("opens a collapsed folder on ArrowRight", () => {
		expect(resolveFocusNavigation({ key: "ArrowRight", current: 1, count: 4, folderExpanded: false }))
			.toEqual({ type: "expand" });
	});
});
```

- [ ] **Step 2: Implement the pure resolver**

```ts
export type FocusNavigationAction =
	| { type: "focus"; index: number }
	| { type: "expand" }
	| { type: "collapse" }
	| { type: "activate" }
	| { type: "none" };

export function resolveFocusNavigation(input: {
	key: string;
	current: number;
	count: number;
	folderExpanded: boolean | null;
}): FocusNavigationAction {
	if (input.key === "Home") return { type: "focus", index: 0 };
	if (input.key === "End") return { type: "focus", index: Math.max(0, input.count - 1) };
	if (input.key === "ArrowDown") return { type: "focus", index: Math.min(input.count - 1, input.current + 1) };
	if (input.key === "ArrowUp") return { type: "focus", index: Math.max(0, input.current - 1) };
	if (input.key === "ArrowRight" && input.folderExpanded === false) return { type: "expand" };
	if (input.key === "ArrowLeft" && input.folderExpanded === true) return { type: "collapse" };
	if (input.key === "Enter" || input.key === " ") return { type: "activate" };
	return { type: "none" };
}
```

- [ ] **Step 3: Apply mode-specific roles**

At render start:

```ts
const treeMode = mode === "tree";
this.listContainer.setAttribute("role", treeMode ? "tree" : "listbox");
this.listContainer.setAttribute("aria-label", treeMode ? "Vault files" : "Vault file list");
```

For list files use `role="option"`; for tree folders/files use `role="treeitem"`, `aria-level`, and `aria-selected`. Give each `.smart-explorer-tree-children` `role="group"`. Set `aria-expanded` on folder summaries whenever the details state changes.

The composite container receives `tabindex="0"`; rows receive stable unique IDs but no tab stop. Track logical keyboard state independently from file selection:

```ts
private activeItemPath: string | null = null;

private getItemDomId(path: string): string {
	return `${this.domIdPrefix}-item-${encodeURIComponent(path)}`;
}
```

Each list option and tree item gets `id=getItemDomId(path)` plus `data-nav-path=path`. Set `aria-activedescendant` on the container only when the active item is mounted. This focus model is intentional: the container retains DOM focus when PR 3 windows list rows.

- [ ] **Step 4: Replace sibling-only Arrow navigation with visible-row navigation**

Add:

```ts
private getVisibleNavigationItems(): HTMLElement[] {
	if (!this.listContainer) return [];
	return Array.from(this.listContainer.querySelectorAll<HTMLElement>(
		'[role="option"], [role="treeitem"]',
	));
}
```

Tree lazy mounting guarantees that this collection contains only visible branches. Add:

```ts
private setActiveItem(path: string | null): void {
	this.activeItemPath = path;
	if (!this.listContainer) return;
	const id = path ? this.getItemDomId(path) : null;
	const mounted = id ? activeDocument.getElementById(id) : null;
	if (mounted && this.listContainer.contains(mounted)) {
		this.listContainer.setAttribute("aria-activedescendant", id!);
	} else {
		this.listContainer.removeAttribute("aria-activedescendant");
	}
	for (const item of this.getVisibleNavigationItems()) {
		item.classList.toggle("is-keyboard-active", item.dataset.navPath === path);
	}
}
```

Handle Arrow/Home/End on the container, resolve the next logical index, call `setActiveItem`, and use `element.scrollIntoView({ block: "nearest" })`. For folder expand/collapse, set `details.open`; for activation, run the existing row/folder action. When closing a folder whose descendant is active, move `activeItemPath` to the folder before unmounting its children.

- [ ] **Step 5: Keep selection attributes synchronized**

Extend `highlightSelected`:

```ts
const selected = row.dataset.path === this.selectedPath;
row.classList.toggle("is-selected", selected);
row.setAttribute("aria-selected", String(selected));
```

Do the same for folder summaries using `selectedFolderPath`.

Selection and active keyboard position are separate: `aria-selected` follows the opened/selected item, while `.is-keyboard-active` and `aria-activedescendant` follow keyboard navigation.

- [ ] **Step 6: Verify semantics and commit**

Run:

```bash
npm test -- --runInBand src/explorer/__tests__/focusNavigation.test.ts src/explorer/__tests__/SmartExplorerView.test.ts src/explorer/__tests__/SmartExplorerView.dom.test.ts
npm run build
```

Manual keyboard acceptance:

1. Tab enters the explorer once, not once per row.
2. Arrow Up/Down moves through every currently visible row.
3. Arrow Right opens a folder; Arrow Left closes it.
4. Enter/Space opens a file.
5. `document.activeElement` remains the list/tree container while `aria-activedescendant` changes.
6. Focus remains visible in light and dark themes.

Commit:

```bash
git add src/explorer/focusNavigation.ts src/explorer/__tests__/focusNavigation.test.ts src/explorer/SmartExplorerView.ts src/explorer/__tests__/SmartExplorerView.test.ts src/explorer/__tests__/SmartExplorerView.dom.test.ts styles.css
git commit -m "fix: add accessible explorer navigation"
```

### Task 6: Add keyboard manual reorder and live feedback

**Files:**

- Modify: `src/explorer/manualOrder.ts`
- Modify: `src/explorer/__tests__/manualOrder.test.ts`
- Modify: `src/explorer/SmartExplorerView.ts:252-405,855-904,1251-1284`
- Modify: `styles.css:508-515`

- [ ] **Step 1: Add failing pure reorder-intent tests**

```ts
it("moves a visible manual item one position by keyboard", () => {
	const sections = [{ id: "all", records: ["a.md", "b.md", "c.md"].map(makeRecord) }];
	expect(reorderManualOrderByDelta(["a.md", "b.md", "c.md"], "b.md", -1, sections))
		.toEqual(["b.md", "a.md", "c.md"]);
	expect(reorderManualOrderByDelta(["a.md", "b.md", "c.md"], "b.md", 1, sections))
		.toEqual(["a.md", "c.md", "b.md"]);
});
```

- [ ] **Step 2: Add the wrapper around existing reorder semantics**

```ts
export function reorderManualOrderByDelta(
	currentOrder: string[],
	draggedPath: string,
	delta: -1 | 1,
	sections: ManualOrderSection[],
): string[] {
	const visible = sections.flatMap((section) => section.records.map((record) => record.path));
	const index = visible.indexOf(draggedPath);
	if (index < 0) return currentOrder;
	const target = Math.max(0, Math.min(visible.length - 1, index + delta));
	if (target === index) return currentOrder;
	const dropBoundary = delta < 0 ? target : target + 1;
	return reorderManualOrder(currentOrder, draggedPath, dropBoundary, sections);
}
```

- [ ] **Step 3: Add a polite live region and keyboard shortcut**

Create once in the toolbar:

```ts
this.liveRegion = toolbar.createDiv({ cls: "smart-explorer-sr-only" });
this.liveRegion.setAttribute("aria-live", "polite");
this.liveRegion.setAttribute("aria-atomic", "true");
```

In manual mode, handle `Alt+ArrowUp` and `Alt+ArrowDown` on the composite container, call the delta helper for `activeItemPath`, persist through the existing undo/save path, keep focus on `listContainer`, restore `aria-activedescendant` to the moved path after render, and announce `Moved <name> to position <n> of <count>.`

- [ ] **Step 4: Add screen-reader-only CSS**

```css
.smart-explorer-sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}
```

- [ ] **Step 5: Verify and commit PR 2**

Run:

```bash
npm test -- --runInBand src/explorer/__tests__/manualOrder.test.ts src/explorer/__tests__/focusNavigation.test.ts src/explorer/__tests__/SmartExplorerView.test.ts
npm run verify
```

Complete a VoiceOver smoke test: list/tree role announced once, file/folder names announced, folder expanded state announced, selection announced, and keyboard reorder feedback announced.

Commit:

```bash
git add src/explorer/manualOrder.ts src/explorer/__tests__/manualOrder.test.ts src/explorer/SmartExplorerView.ts src/explorer/__tests__/SmartExplorerView.test.ts styles.css
git commit -m "feat: add keyboard manual reordering"
```

PR title: `fix: make explorer navigation accessible`

---

## PR 3 — Large-vault performance

### Task 7: Store tree counts and lazily mount closed folders

**Files:**

- Modify: `src/explorer/TreeModel.ts:5-131`
- Modify: `src/explorer/__tests__/TreeModel.test.ts`
- Modify: `src/explorer/SmartExplorerView.ts:601-623,790-846,1515-1524`
- Modify: `src/explorer/__tests__/SmartExplorerView.test.ts`

- [ ] **Step 1: Add failing tree-count tests**

```ts
it("stores recursive file counts on every folder", () => {
	const tree = buildTree([
		makeRecord("a/one.md"),
		makeRecord("a/b/two.md"),
		makeRecord("a/b/three.md"),
	], baseQuery);
	const a = tree.children[0] as ExplorerTreeFolderNode;
	const b = a.children.find((node) => node.type === "folder") as ExplorerTreeFolderNode;
	expect(tree.fileCount).toBe(3);
	expect(a.fileCount).toBe(3);
	expect(b.fileCount).toBe(2);
});
```

- [ ] **Step 2: Add `fileCount` to tree nodes and compute it once**

Add `fileCount: number` to root and folder types, initialize it to zero, and run one post-order pass after sorting:

```ts
function populateFileCounts(node: ExplorerTreeRoot | ExplorerTreeFolderNode): number {
	const count = node.children.reduce((total, child) =>
		total + (child.type === "file" ? 1 : populateFileCounts(child)), 0);
	node.fileCount = count;
	return count;
}
```

Delete `countTreeFiles` from `SmartExplorerView.ts` and render `formatFileCount(node.fileCount)`.

- [ ] **Step 3: Mount folder children only when the folder is open**

Extract:

```ts
private mountTreeChildren(
	container: HTMLElement,
	node: ExplorerTreeFolderNode,
): void {
	container.empty();
	const inlineCreate = this.createInlineCreateElement(node.path, node.depth + 1);
	if (inlineCreate) container.appendChild(inlineCreate);
	for (const child of node.children) {
		container.appendChild(this.createTreeNodeElement(child));
	}
}
```

When creating a folder, create the children container but call `mountTreeChildren` only when `details.open` is true. On toggle open, mount; on toggle closed, `children.empty()`. Search/reveal correctness is preserved because `shouldOpenTreeFolder` already opens filter matches and selected ancestors.

- [ ] **Step 4: Remove the duplicate tree-mode filter/sort/group pipeline**

Split `renderListContent` immediately after `effectiveQuery`:

```ts
if (mode === "tree") {
	this.syncSelectedPathFromActiveFile();
	const tree = buildTree(records, effectiveQuery, this.manualOrderIndex, folderPaths);
	const displayed = tree.fileCount;
	if (displayed === 0 && folderPaths.length === 0 && !hasInlineCreate) {
		this.renderNoMatches();
		return;
	}
	this.visibleTreeFolderPaths = collectTreeFolderPaths(tree.children);
	const rootCreate = this.createInlineCreateElement("", 0);
	if (rootCreate) this.listContainer.appendChild(rootCreate);
	for (const node of tree.children) {
		this.listContainer.appendChild(this.createTreeNodeElement(node));
	}
	this.updateFileCount(displayed, records.length);
	this.updateViewModeControl();
	this.updateManualOrderControls();
	return;
}

const sections = buildSections(records, effectiveQuery, this.manualOrderIndex);
const displayed = sections.reduce((total, section) => total + section.records.length, 0);
```

Tree mode now filters and sorts exactly once through `buildTree`; list mode continues to use `buildSections`.

- [ ] **Step 5: Guard global expansion in large vaults**

Add:

```ts
const EAGER_EXPAND_FILE_LIMIT = 2000;
```

If the user requests `Open all folders` above that limit, leave existing expansion state unchanged and show `Open folders individually in vaults over 2,000 files.` This limit prevents a toolbar action from intentionally defeating lazy mounting. Keep `Close all folders` available at every size.

- [ ] **Step 6: Prove closed folders do not create descendant DOM**

```ts
it("does not mount descendants of a closed folder", () => {
	const view = Object.create(SmartExplorerView.prototype) as any;
	view.query = baseQuery;
	view.treeExpandedPaths = new Set<string>();
	view.selectedPath = null;
	view.selectedFolderPath = null;
	view.inlineEdit = null;
	view.updateTreeToggleControl = jest.fn();
	view.showTooltip = jest.fn();
	view.hideTooltip = jest.fn();
	view.attachLongPressMenu = jest.fn();
	view.createRowElement = (record: FileRecord) => {
		const row = document.createElement("div");
		row.className = "smart-explorer-row";
		row.dataset.path = record.path;
		return row;
	};
	const tree = buildTree(
		Array.from({ length: 1000 }, (_, index) => makeRecord(`closed/file-${index}.md`)),
		baseQuery,
	);
	const folder = tree.children[0] as ExplorerTreeFolderNode;

	const details = view.createTreeNodeElement(folder) as HTMLDetailsElement;
	expect(details.querySelectorAll(".smart-explorer-row")).toHaveLength(0);

	details.open = true;
	details.dispatchEvent(new Event("toggle"));
	expect(details.querySelectorAll(".smart-explorer-row")).toHaveLength(1000);
});
```

- [ ] **Step 7: Verify and commit**

Run:

```bash
npm test -- --runInBand src/explorer/__tests__/TreeModel.test.ts src/explorer/__tests__/SmartExplorerView.dom.test.ts
npm run build
```

Commit:

```bash
git add src/explorer/TreeModel.ts src/explorer/__tests__/TreeModel.test.ts src/explorer/SmartExplorerView.ts src/explorer/__tests__/SmartExplorerView.dom.test.ts
git commit -m "perf: lazily render tree folders"
```

### Task 8: Replace disabled virtualization with keyed windowed rendering

**Files:**

- Modify: `src/explorer/VirtualList.ts:1-86`
- Create: `src/explorer/__tests__/VirtualList.test.ts`
- Modify: `src/explorer/SmartExplorerView.ts:637-655`
- Modify: `src/explorer/__tests__/SmartExplorerView.dom.test.ts`
- Modify: `styles.css:539-546`

- [ ] **Step 1: Add failing bounded-DOM and reuse tests**

Start the file with the jsdom directive and shared shims:

```ts
/** @jest-environment jsdom */

import "../../test-utils/obsidianDom";
import { mockElementBox } from "../../test-utils/obsidianDom";
```

Create a 10,000-item list with a 440px viewport and 44px rows. Keep container focus and pin item `0`, then scroll well past it. Assert bounded DOM, node reuse, active-item retention, and virtual collection metadata:

```ts
expect(container.querySelectorAll(".test-row").length).toBeLessThanOrEqual(30);
const reused = container.querySelector('[data-key="1"]');
container.tabIndex = 0;
container.focus();
list.setPinnedKey("0");
container.scrollTop = 44;
container.dispatchEvent(new Event("scroll"));
jest.runOnlyPendingTimers();
expect(container.querySelector('[data-key="1"]')).toBe(reused);

container.scrollTop = 4400;
container.dispatchEvent(new Event("scroll"));
jest.runOnlyPendingTimers();
expect(document.activeElement).toBe(container);
expect(container.querySelector('[data-key="0"]')).not.toBeNull();
expect(container.querySelectorAll(".test-row").length).toBeLessThanOrEqual(31);
expect(container.querySelector('[data-key="100"]')?.getAttribute("aria-posinset")).toBe("101");
expect(container.querySelector('[data-key="100"]')?.getAttribute("aria-setsize")).toBe("10000");
```

Also assert `scrollToIndex(9999)` mounts the final item and `destroy()` removes the scroll listener, pending animation frame, and all mounted nodes.

- [ ] **Step 2: Replace factory-only items with keyed items**

Use this public contract:

```ts
export type VirtualListItem = {
	key: string;
	render: () => HTMLElement;
};

constructor(container: HTMLElement, rowHeight: number)
setItems(items: VirtualListItem[]): void
setPinnedKey(key: string | null): void
scrollTo(top: number): void
scrollToIndex(index: number): void
destroy(): void
static shouldVirtualize(count: number): boolean
```

Maintain `mounted = new Map<string, HTMLElement>()`. On each animation-frame render:

1. Compute buffered `[start, end)` indexes.
2. Build the wanted-key set from the visible window plus `pinnedKey` when it still exists.
3. Remove only mounted keys outside that wanted set.
4. Reuse nodes whose keys remain wanted.
5. Create only newly wanted keys.
6. Set each node to `position:absolute; left:0; right:0; transform:translateY(index * rowHeight)`.
7. Set `aria-posinset=index + 1` and `aria-setsize=items.length` on every mounted option.
8. Set the content height to `items.length * rowHeight`.

Set `VIRTUAL_THRESHOLD = 200`; this keeps small lists simple while bounding large-list DOM.

- [ ] **Step 3: Throttle scrolling with one animation frame**

```ts
private scheduleRender = () => {
	if (this.frame !== null) return;
	this.frame = window.requestAnimationFrame(() => {
		this.frame = null;
		this.renderWindow();
	});
};
```

Cancel `frame` during `destroy()`.

- [ ] **Step 4: Integrate the final row height**

Use 44px desktop and 52px mobile for list rows:

```ts
const rowHeight = Platform.isMobile ? 52 : 44;
this.virtualList = new VirtualList(this.listContainer, rowHeight);
this.virtualList.setItems(sections[0]!.records.map((record) => ({
	key: record.path,
	render: () => this.createRowElement(record),
})));
this.virtualList.setPinnedKey(this.activeItemPath);
```

When keyboard navigation changes `activeItemPath`, call `setPinnedKey(path)` before updating `aria-activedescendant`. If the target is outside the window, call `scrollToIndex(index)` first, render the window, then update the active descendant. Mouse/trackpad scrolling may move the active option outside the visible window, but the single pinned option remains mounted so the container never references a missing ID.

This is the accepted virtual-list accessibility boundary: only visible options plus the active option are mounted, while `aria-setsize`/`aria-posinset` expose logical collection position. Keep grouped and manual lists non-windowed in this PR. Record a follow-up only if real-vault profiling shows grouped lists need section-aware virtualization.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm test -- --runInBand src/explorer/__tests__/VirtualList.test.ts src/explorer/__tests__/SmartExplorerView.dom.test.ts
npm run build
```

Expected: 10,000 items produce no more than the viewport plus 20 buffer rows and one pinned active row; scrolling reuses overlapping nodes; container focus and `aria-activedescendant` remain valid.

Commit:

```bash
git add src/explorer/VirtualList.ts src/explorer/__tests__/VirtualList.test.ts src/explorer/SmartExplorerView.ts src/explorer/__tests__/SmartExplorerView.dom.test.ts styles.css
git commit -m "perf: add keyed windowed list rendering"
```

### Task 9: Remove manual-sort hot-path scans and repeated reconciliation

**Files:**

- Modify: `src/explorer/DragSortManager.ts:14-346`
- Modify: `src/explorer/__tests__/DragSortManager.test.ts`
- Modify: `src/explorer/__tests__/DragSortManager.dom.test.ts`
- Modify: `src/explorer/SmartExplorerView.ts:192-250,597-599,637-700,1225-1273`

- [ ] **Step 1: Add failing drag-geometry tests**

Start `DragSortManager.dom.test.ts` with `@jest-environment jsdom` and import `obsidianDom`. Use `mockElementBox` to assign the container and ten rows deterministic offsets. Spy on every row's `getBoundingClientRect`, start a drag, and dispatch ten dragover events:

```ts
function createDragEvent(type: string, clientY: number): DragEvent {
	const event = new MouseEvent(type, { bubbles: true, clientY }) as DragEvent;
	Object.defineProperty(event, "dataTransfer", {
		value: {
			effectAllowed: "none",
			dropEffect: "none",
			setData: jest.fn(),
		},
	});
	return event;
}

for (let index = 0; index < rows.length; index++) {
	mockElementBox(rows[index]!, { top: index * 44, width: 300, height: 44 });
}
const rowRectSpies = rows.map((row) => jest.spyOn(row, "getBoundingClientRect"));

handle.dispatchEvent(createDragEvent("dragstart", 20));
for (let index = 0; index < 10; index++) {
	container.dispatchEvent(createDragEvent("dragover", 20 + index * 10));
}

for (const spy of rowRectSpies) expect(spy).not.toHaveBeenCalled();
```

Add a second test that advances the auto-scroll timer, changes `container.scrollTop`, and proves the drop index changes without row geometry calls.

- [ ] **Step 2: Cache row offsets at drag start**

Add:

```ts
private rowBounds: { top: number; bottom: number }[] = [];

private refreshRowBounds(): void {
	this.rowBounds = this.rows.map((row) => ({
		top: row.el.offsetTop,
		bottom: row.el.offsetTop + row.el.offsetHeight,
	}));
}
```

Call it from desktop `dragstart` and `startTouchDrag`. Convert pointer coordinates once with `clientY - containerRect.top + container.scrollTop`, then pass cached offsets to `calculateDropIndexFromRowBounds`.

Delete `getRowHeight` from `DragSortOptions`. Manual sort is intentionally non-windowed, so drop indicators use cached real `offsetTop/offsetHeight` values. This removes the stale 28px constant instead of duplicating the new 44/52px list-row contract.

- [ ] **Step 3: Register manual rows during creation**

Create `DragSortManager` before rendering manual rows. Extend `createRowElement(record, sectionId?)`; when a manual handle is created and the manager exists, call `attachRow(row, record.path, sectionId, handle)` immediately. Delete `attachManualDragRows` and its `querySelector` pass.

- [ ] **Step 4: Reconcile manual order only when the indexed path set changes**

Add:

```ts
private manualOrderNeedsReconcile = true;
```

Set it to true on create, delete, and rename events. Set it to false after `initializeManualOrder`. During ordinary manual renders, rebuild only `manualOrderIndex`; do not seed-sort and reconcile again.

Replace newline joins with a pure array comparison:

```ts
function sameOrder(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((path, index) => path === b[index]);
}
```

- [ ] **Step 5: Verify and commit PR 3**

Run:

```bash
npm test -- --runInBand src/explorer/__tests__/DragSortManager.test.ts src/explorer/__tests__/DragSortManager.dom.test.ts src/explorer/__tests__/manualOrder.test.ts src/explorer/__tests__/SmartExplorerView.test.ts src/explorer/__tests__/SmartExplorerView.dom.test.ts src/explorer/__tests__/VirtualList.test.ts src/explorer/__tests__/TreeModel.test.ts
npm run verify
```

Commit:

```bash
git add src/explorer/DragSortManager.ts src/explorer/__tests__/DragSortManager.test.ts src/explorer/__tests__/DragSortManager.dom.test.ts src/explorer/SmartExplorerView.ts src/explorer/__tests__/SmartExplorerView.test.ts src/explorer/__tests__/SmartExplorerView.dom.test.ts
git commit -m "perf: reduce manual sort layout work"
```

PR title: `perf: scale explorer rendering for large vaults`

---

## PR 4 — Lifecycle and integration hardening

### Task 10: Serialize settings saves and surface async failures

**Files:**

- Modify: `src/main.ts:8-62`
- Modify: `src/__tests__/main.test.ts`
- Modify: `src/explorer/SmartExplorerView.ts:154-190,969-1004,1100-1117,1503-1511`
- Modify: `src/explorer/__tests__/SmartExplorerView.test.ts`
- Modify: `src/settings/settings-tab.ts:50-121`
- Modify: `src/settings/__tests__/settings-tab.test.ts`

- [ ] **Step 1: Add failing save-order tests**

Add a serial-order test and a failure-recovery test to `main.test.ts`:

```ts
it("serializes immutable settings snapshots", async () => {
	let resolveFirst!: () => void;
	const firstWrite = new Promise<void>((resolve) => { resolveFirst = resolve; });
	const plugin = makePlugin();
	plugin.saveData = jest.fn()
		.mockReturnValueOnce(firstWrite)
		.mockResolvedValueOnce(undefined);

	plugin.settings.hiddenExtensions = ["png"];
	const first = plugin.saveSettings();
	plugin.settings.hiddenExtensions = ["pdf"];
	const second = plugin.saveSettings();

	expect(plugin.saveData).toHaveBeenCalledTimes(1);
	resolveFirst();
	await first;
	await second;
	expect(plugin.saveData).toHaveBeenNthCalledWith(1, expect.objectContaining({ hiddenExtensions: ["png"] }));
	expect(plugin.saveData).toHaveBeenNthCalledWith(2, expect.objectContaining({ hiddenExtensions: ["pdf"] }));
});

it("continues saving after one write rejects", async () => {
	const plugin = makePlugin();
	plugin.saveData = jest.fn()
		.mockRejectedValueOnce(new Error("disk full"))
		.mockResolvedValueOnce(undefined);

	await expect(plugin.saveSettings()).rejects.toThrow("disk full");
	await expect(plugin.saveSettings()).resolves.toBeUndefined();
	expect(plugin.saveData).toHaveBeenCalledTimes(2);
});
```

Add a view-close test that schedules a manual save, calls `await onClose()`, and asserts the final save/flush has resolved before `onClose` resolves.

- [ ] **Step 2: Serialize immutable settings snapshots**

In the plugin:

```ts
private settingsSaveQueue: Promise<void> = Promise.resolve();

saveSettings(): Promise<void> {
	const snapshot: SmartExplorerSettings = {
		...this.settings,
		hiddenExtensions: [...this.settings.hiddenExtensions],
		manualOrder: [...this.settings.manualOrder],
	};
	const operation = this.settingsSaveQueue.then(() => this.saveData(snapshot));
	this.settingsSaveQueue = operation.catch(() => undefined);
	return operation;
}

async flushSettings(): Promise<void> {
	await this.settingsSaveQueue;
}

async saveSettingsWithNotice(failure: string): Promise<boolean> {
	try {
		await this.saveSettings();
		return true;
	} catch (error) {
		new Notice(`${failure}: ${error instanceof Error ? error.message : String(error)}`);
		return false;
	}
}
```

`operation` rejects to the current caller, while `settingsSaveQueue` catches that failure solely to keep the next queued write runnable. The attached catch also prevents an ignored returned operation from becoming an unhandled rejection.

- [ ] **Step 3: Await pending manual-order persistence on close**

When `saveOrderTimeout` exists, clear it and `await this.plugin.saveSettingsWithNotice("Could not save manual order")`, then `await this.plugin.flushSettings()`. Keep `onClose` async and do not use a detached promise.

- [ ] **Step 4: Route user actions through one error boundary**

Add:

```ts
private async runAction(action: () => Promise<void>, failure: string): Promise<void> {
	try {
		await action();
	} catch (error) {
		new Notice(`${failure}: ${error instanceof Error ? error.message : String(error)}`);
	}
}
```

Use it for ordinary file opening, open-in-leaf actions, clipboard writes, and Finder/default-app actions. Provide lightweight `Copied path.` feedback after a successful clipboard write.

Use `saveSettingsWithNotice` from `settings-tab.ts`, view-mode persistence, reset manual order, hidden-extension changes, and debounced manual-order persistence. Add settings-tab tests asserting a rejected save displays one Notice and a later change still saves successfully. Finish the task with:

```bash
rg -n "saveSettings\(" src
```

Expected: every result either uses `await` inside `try/catch`, is passed through `runAction`, or is replaced by `saveSettingsWithNotice`; no detached raw save remains.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm test -- --runInBand src/__tests__/main.test.ts src/explorer/__tests__/SmartExplorerView.test.ts src/settings/__tests__/settings-tab.test.ts
npm run build
```

Commit:

```bash
git add src/main.ts src/__tests__/main.test.ts src/explorer/SmartExplorerView.ts src/explorer/__tests__/SmartExplorerView.test.ts src/settings/settings-tab.ts src/settings/__tests__/settings-tab.test.ts
git commit -m "fix: serialize explorer persistence"
```

### Task 11: Synchronize workspace selection and purge folder subtrees

**Files:**

- Modify: `src/explorer/FileIndex.ts:55-141`
- Modify: `src/explorer/__tests__/FileIndex.test.ts`
- Modify: `src/explorer/SmartExplorerView.ts:192-243,946-951`
- Modify: `src/explorer/__tests__/SmartExplorerView.test.ts`

- [ ] **Step 1: Add failing subtree and selection tests**

```ts
it("removes every indexed child for a deleted folder", () => {
	const index = buildIndex(["keep.md", "gone/a.md", "gone/nested/b.md"]);
	index.removeFolder("gone");
	expect(index.getAll().map((record) => record.path)).toEqual(["keep.md"]);
});
```

Add a view test that emits `file-open` with a file, expects only selected DOM state to update, then emits `file-open` with `null` and expects the old selection to clear. Assert neither event changes scroll position or expands folders.

- [ ] **Step 2: Implement explicit folder removal and incremental folder paths**

```ts
removeFolder(folderPath: string): void {
	const prefix = `${folderPath}/`;
	for (const path of this.records.keys()) {
		if (path.startsWith(prefix)) this.records.delete(path);
	}
	for (const path of this.folderPaths) {
		if (path === folderPath || path.startsWith(prefix)) this.folderPaths.delete(path);
	}
}
```

Maintain `folderPaths` during build, folder create/delete, and folder rename so `getFolderPaths()` returns a sorted copy without scanning `getAllLoadedFiles()` on every tree render.

- [ ] **Step 3: Listen to active-file changes without automatic reveal**

Register:

```ts
this.registerEvent(this.app.workspace.on("file-open", (file) => {
	this.selectedPath = file?.path ?? null;
	this.selectedFolderPath = null;
	this.highlightSelected();
}));
```

Keep reveal explicit. Do not expand ancestors or scroll when users switch tabs elsewhere.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm test -- --runInBand src/explorer/__tests__/FileIndex.test.ts src/explorer/__tests__/SmartExplorerView.test.ts
```

Commit:

```bash
git add src/explorer/FileIndex.ts src/explorer/__tests__/FileIndex.test.ts src/explorer/SmartExplorerView.ts src/explorer/__tests__/SmartExplorerView.test.ts
git commit -m "fix: synchronize vault lifecycle state"
```

### Task 12: Add lifecycle integration tests and a guarded large-vault fixture

**Files:**

- Create: `src/explorer/__tests__/SmartExplorerView.integration.test.ts`
- Create: `scripts/prepare-large-vault-fixture.mjs`
- Create: `scripts/__tests__/prepare-large-vault-fixture.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Build one minimal fake App integration harness**

The fake must provide event emitters for `vault.create/delete/rename/modify` and `workspace.file-open`, real `TFile`/`TFolder` test classes, a DOM container, and controllable `saveData` promises. Reuse it for these exact cases:

1. create file → index grows → debounced DOM count changes;
2. delete folder → every child leaves index and DOM;
3. rename folder → child paths and manual order rewrite;
4. event burst → one render after 300ms;
5. hidden-extension setting change → open view refreshes;
6. open failure → Notice contains the error;
7. close during pending manual save → save resolves before close completes.

- [ ] **Step 2: Add a marker-protected fixture script**

The script must accept only:

```bash
node scripts/prepare-large-vault-fixture.mjs --vault /Users/Roger/my-vault --files 5000
node scripts/prepare-large-vault-fixture.mjs --vault /Users/Roger/my-vault --remove
```

It may create/delete only `<vault>/.smart-explorer-large-vault-fixture`. Creation writes a `.smart-explorer-fixture-marker` before file generation. Removal must refuse unless both the directory basename and marker match. Generate 100 folders with evenly distributed Markdown files plus representative PNG/PDF/DOCX placeholder files; content should be a single heading or a zero-byte non-Markdown placeholder so the fixture stays small.

- [ ] **Step 3: Test the guards before using the script**

Tests must prove:

- missing `--vault` fails;
- `--files` outside 100–50000 fails;
- cleanup refuses an unmarked directory;
- cleanup never deletes the vault root;
- a temp-directory fixture creates and removes exactly its own subtree.

Add:

```json
"test:fixture": "node --test scripts/__tests__/prepare-large-vault-fixture.test.mjs"
```

Append `npm run test:fixture` to `verify`.

- [ ] **Step 4: Run automated verification**

```bash
npm run verify
```

Expected: lint, build, all Jest tests, release tests, and fixture safety tests pass.

- [ ] **Step 5: Run the authorized real-vault acceptance matrix**

Use `/Users/Roger/my-vault`, which is the dedicated Obsidian plugin development/test vault. Capture results for:

| Scenario | Acceptance |
|---|---|
| 370-file existing vault | No behavior regression; tree/list/search/manual create/rename/trash work |
| 5,000-file fixture, indexing | `metadataCache.getFileCache` is not called; median of three cold index builds stays under 1,000ms and the duration is recorded |
| 5,000-file fixture, list | Initial usable render under 500ms after indexing; rendered rows stay under 60; smooth wheel/trackpad scroll |
| 5,000-file fixture, closed tree | DOM contains folder summaries and only open-branch descendants; no eager 5,000-row subtree |
| Search | Whitespace query equals empty query; visible results/count/clear state agree |
| Non-Markdown filter | `.canvas`, `.base`, `.docx`, `.csv`, and other non-`.md` files appear; Markdown files do not |
| Narrow list at 300px | Every row shows parent path; duplicate names are distinguishable |
| Keyboard | One Tab entry, complete arrow navigation, folder expand/collapse, file activation, manual reorder |
| Settings | Hidden extensions and reset order refresh all open Smart Explorer views |
| Lifecycle | Switching active tabs updates highlight without scroll/reveal jumps |
| Mobile/tablet | 44px+ controls, long press menu, long press drag, safe-area padding |
| Themes | Selected file/folder and focus ring readable in light and dark themes |

After testing, run the marker-protected `--remove` command and verify the fixture directory is gone while all other test-vault files remain.

- [ ] **Step 6: Commit PR 4**

```bash
git add src/explorer/__tests__/SmartExplorerView.integration.test.ts scripts/prepare-large-vault-fixture.mjs scripts/__tests__/prepare-large-vault-fixture.test.mjs package.json
git commit -m "test: add explorer lifecycle coverage"
```

PR title: `test: harden explorer lifecycle and large-vault verification`

---

## Final documentation and release gate

### Task 13: Update live documentation and close the milestone

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `docs/release-checklist.md`

- [ ] **Step 1: Update only shipped behavior**

Document:

- extension filtering;
- remembered tree/list mode;
- keyboard navigation and `Alt+Arrow` manual reorder;
- lazy tree rendering and keyed list windowing;
- `/Users/Roger/my-vault` as the local development/test-vault convention in agent-facing docs only, not the public README;
- fixture creation/removal commands in the release checklist.

Do not mention removed metadata fields, abandoned virtualization, or deferred features in README feature copy.

- [ ] **Step 2: Run the final gate from a clean worktree**

```bash
git status --short
npm run verify
git diff --check
```

Expected: only intended documentation changes remain before commit; all verification passes; `git diff --check` is silent.

- [ ] **Step 3: Commit documentation**

```bash
git add README.md AGENTS.md CLAUDE.md docs/release-checklist.md
git commit -m "docs: document explorer optimization behavior"
```

- [ ] **Step 4: Review milestone evidence before release**

The milestone is complete only when all four PRs are merged, CI `verify` is green, the 5,000-file test-vault matrix is recorded, the fixture is removed, and no deferred feature entered the release diff.

Do not bump the version in any optimization PR. After the milestone is accepted, create a separate release PR that updates `package.json`, `manifest.json`, and `versions.json` from `0.5.4` to `0.6.0`; merge it before creating and pushing the tag so the existing CI release workflow remains the only release publisher.

---

## Success metrics

- **Correctness:** whitespace search, non-Markdown filtering, extension filtering, settings migration, folder subtree deletion, and active-file state all have automated regressions.
- **Accessibility:** all interactive controls have stable names; disclosure controls expose `aria-expanded`; list/tree roles are valid; each explorer composite is one Tab stop with a valid `aria-activedescendant`; virtualized rows expose `aria-posinset` and `aria-setsize`; every core browse/reorder action is keyboard reachable.
- **Clarity:** parent path remains visible at 300px; selected folders have visible feedback; singular/plural counts and empty states describe the real state.
- **Scale:** a 5,000-file cold index build stays under 1,000ms without metadata-cache reads; a flat list keeps fewer than 60 file-row DOM nodes plus at most one pinned active row; a closed tree does not mount descendant file rows; dragover does not measure every row per frame.
- **Reliability:** settings saves are serialized, view close awaits pending persistence, async failures produce a Notice, and lifecycle integration tests cover event bursts and subtree changes.
- **Scope:** no preview, saved-view, full-text/AI, network, bulk file-management, or tree-manual-order code is added.
