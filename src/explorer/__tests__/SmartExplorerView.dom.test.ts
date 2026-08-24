/** @jest-environment jsdom */

jest.mock(
	"obsidian",
	() => ({
		ItemView: class {
			app: unknown;
			containerEl: HTMLElement;

			constructor(leaf: { app: unknown }) {
				this.app = leaf.app;
				this.containerEl = document.createElement("div");
				this.containerEl.append(document.createElement("div"), document.createElement("div"));
			}

			registerEvent() {}
		},
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

import { installObsidianDomShim, mockElementBox } from "../../test-utils/obsidianDom";
import { buildTree } from "../TreeModel";
import type { FileRecord } from "../../types";
import { setIcon } from "obsidian";
import { SmartExplorerView } from "../SmartExplorerView";

function makeRecord(path: string, extension: string): FileRecord {
	const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
	return {
		path,
		basename: path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? path,
		extension,
		parentPath,
		size: 1,
		ctime: 1,
		mtime: 1,
		isMarkdown: extension === "md",
	};
}

function makeView() {
	(globalThis as typeof globalThis & { activeWindow: Window }).activeWindow = window;
	const app = {
		vault: {
			getAllLoadedFiles: () => [],
			getAbstractFileByPath: () => null,
		},
		workspace: { getActiveFile: () => null },
		metadataCache: {},
	};
	const plugin = {
		app,
		settings: {
			defaultSort: "name-asc",
			defaultGroup: "none",
			lastViewMode: "tree",
			hiddenExtensions: [],
			manualOrder: [],
		},
		saveSettings: jest.fn().mockResolvedValue(undefined),
		saveSettingsWithNotice: jest.fn().mockResolvedValue(true),
		flushSettings: jest.fn().mockResolvedValue(undefined),
	};
	const view = new SmartExplorerView({ app } as never, plugin as never) as any;
	const container = view.containerEl.children[1] as HTMLElement;
	view.renderShell(container);
	return { view, container };
}

describe("SmartExplorerView DOM foundation", () => {
	type OptionalAnimationGlobals = typeof globalThis & {
		requestAnimationFrame?: typeof requestAnimationFrame;
		cancelAnimationFrame?: typeof cancelAnimationFrame;
	};

	it("uses the last view mode for each newly opened leaf", () => {
		const { view } = makeView();
		view.plugin.settings.lastViewMode = "list";
		const nextView = new SmartExplorerView({ app: view.app } as never, view.plugin as never) as any;

		expect(nextView.viewMode).toBe("list");
	});

	it("persists a user toggle without changing another open leaf", async () => {
		const first = makeView();
		const second = new SmartExplorerView({ app: first.view.app } as never, first.view.plugin as never) as any;
		const secondContainer = second.containerEl.children[1] as HTMLElement;
		second.renderShell(secondContainer);

		(first.container.querySelector(".smart-explorer-view-mode") as HTMLButtonElement).click();
		await Promise.resolve();

		expect(first.view.viewMode).toBe("list");
		expect(second.viewMode).toBe("tree");
		expect(first.view.plugin.settings.lastViewMode).toBe("list");
		expect(first.view.plugin.saveSettingsWithNotice).toHaveBeenCalledTimes(1);
		expect(first.view.plugin.saveSettings).not.toHaveBeenCalled();
	});

	it("applies current Obsidian element info fields used by the explorer", () => {
		const parent = globalThis.createDiv({ cls: "form-shell" });
		const input = parent.createEl("input", {
			type: "text",
			value: "needle",
			placeholder: "Search files...",
			title: "Search",
		}) as HTMLInputElement;
		const select = parent.createEl("select");
		const option = select.createEl("option", {
			value: "modified-new",
			text: "Modified",
		}) as HTMLOptionElement;
		const link = parent.createEl("a", {
			href: "https://example.com/docs",
			title: "Docs",
			text: "Open docs",
		}) as HTMLAnchorElement;

		expect(parent.children).toHaveLength(3);
		expect(input.type).toBe("text");
		expect(input.value).toBe("needle");
		expect(input.placeholder).toBe("Search files...");
		expect(input.title).toBe("Search");
		expect(option.value).toBe("modified-new");
		expect(option.textContent).toBe("Modified");
		expect(link.getAttribute("href")).toBe("https://example.com/docs");
		expect(link.title).toBe("Docs");
		expect(link.textContent).toBe("Open docs");
	});

	it("preserves native HTML tag normalization in the element shim", () => {
		const createAnyTag = globalThis.createEl as (tag: string) => HTMLElement;
		const element = createAnyTag("DIV");

		expect(element).toBeInstanceOf(HTMLDivElement);
		expect(element.localName).toBe("div");
	});

	it("creates and resets Obsidian-style elements with deterministic layout", () => {
		const parent = globalThis.createDiv({ cls: "parent" });
		const child = parent.createDiv({
			cls: ["child", "", "secondary"],
			text: "Hello",
			attr: { "data-kind": "note" },
		});
		const label = child.createSpan({ text: "Label", cls: "label extra" });

		mockElementBox(child, {
			top: 44,
			left: 16,
			width: 300,
			height: 44,
		});

		expect(Array.from(child.classList)).toEqual(["child", "secondary"]);
		expect(child.textContent).toBe("HelloLabel");
		expect(child.getAttribute("data-kind")).toBe("note");
		expect(Array.from(label.classList)).toEqual(["label", "extra"]);
		expect(child.offsetTop).toBe(44);
		expect(child.getBoundingClientRect().bottom).toBe(88);
		expect(child.getBoundingClientRect().toJSON()).toEqual({
			x: 16,
			y: 44,
			top: 44,
			left: 16,
			right: 316,
			bottom: 88,
			width: 300,
			height: 44,
		});

		parent.empty();
		expect(parent.childElementCount).toBe(0);
	});

	it("defaults missing box values to zero", () => {
		const element = globalThis.createDiv({ cls: "default-box" });

		mockElementBox(element, { left: 12 });

		expect(element.offsetTop).toBe(0);
		expect(element.offsetHeight).toBe(0);
		expect(element.getBoundingClientRect().toJSON()).toEqual({
			x: 12,
			y: 0,
			top: 0,
			left: 12,
			right: 12,
			bottom: 0,
			width: 0,
			height: 0,
		});
	});

	it("shims requestAnimationFrame with async performance-based timing and cancellation", () => {
		jest.useFakeTimers();

		const animationGlobals: OptionalAnimationGlobals = globalThis;
		const originalRaf = globalThis.requestAnimationFrame;
		const originalCancelRaf = globalThis.cancelAnimationFrame;
		const performanceNowSpy = jest.spyOn(window.performance, "now").mockReturnValue(123.45);
		const callback = jest.fn();
		const cancelledCallback = jest.fn();

		try {
			Reflect.deleteProperty(animationGlobals, "requestAnimationFrame");
			Reflect.deleteProperty(animationGlobals, "cancelAnimationFrame");

			installObsidianDomShim();

			const handle = globalThis.requestAnimationFrame(callback);
			const cancelled = globalThis.requestAnimationFrame(cancelledCallback);
			globalThis.cancelAnimationFrame(cancelled);

			expect(callback).not.toHaveBeenCalled();
			expect(cancelledCallback).not.toHaveBeenCalled();

			jest.runAllTimers();

			expect(callback).toHaveBeenCalledTimes(1);
			expect(callback).toHaveBeenCalledWith(123.45);
			expect(cancelledCallback).not.toHaveBeenCalled();
			expect(handle).toBeGreaterThanOrEqual(0);
		} finally {
			performanceNowSpy.mockRestore();
			if (originalRaf) globalThis.requestAnimationFrame = originalRaf;
			else Reflect.deleteProperty(animationGlobals, "requestAnimationFrame");
			if (originalCancelRaf) globalThis.cancelAnimationFrame = originalCancelRaf;
			else Reflect.deleteProperty(animationGlobals, "cancelAnimationFrame");
			jest.useRealTimers();
		}
	});
});

describe("SmartExplorerView toolbar controls", () => {
	it("renders list rows with basename and persistent parent-path identity", () => {
		const { view, container } = makeView();
		view.fileIndex = {
			getAll: () => [makeRecord("projects/roadmap.md", "md")],
			getFolderPaths: () => ["projects"],
		};
		view.viewMode = "list";

		view.renderList();

		const list = container.querySelector<HTMLElement>(".smart-explorer-list")!;
		const identity = list.querySelector<HTMLElement>(".smart-explorer-row-identity")!;
		expect(list.classList.contains("is-list-view")).toBe(true);
		expect(list.classList.contains("is-tree-view")).toBe(false);
		expect(identity.querySelector(".smart-explorer-row-name")?.textContent).toBe("roadmap");
		expect(identity.querySelector(".smart-explorer-row-parent")?.textContent).toBe("projects");
		expect(identity.querySelector(".smart-explorer-row-date")).not.toBeNull();
	});

	it("renders singular file counts in the toolbar and tree folders", () => {
		const { view, container } = makeView();
		view.fileIndex = {
			getAll: () => [makeRecord("notes/one.md", "md")],
			getFolderPaths: () => ["notes"],
		};
		view.viewMode = "tree";

		view.renderList();

		expect(container.querySelector(".smart-explorer-file-count")?.textContent).toBe("1 file");
		expect(container.querySelector(".smart-explorer-tree-count")?.textContent).toBe("1 file");
	});

	it("marks the selected tree folder visibly", () => {
		const { view, container } = makeView();
		view.fileIndex = {
			getAll: () => [makeRecord("notes/one.md", "md")],
			getFolderPaths: () => ["notes"],
		};
		view.viewMode = "tree";
		view.selectedFolderPath = "notes";

		view.renderList();

		expect(container.querySelector(".smart-explorer-tree-folder-summary")?.classList.contains("is-selected"))
			.toBe(true);
	});

	it("distinguishes an empty vault without offering a clear action", () => {
		const { view, container } = makeView();
		view.fileIndex = { getAll: () => [], getFolderPaths: () => [] };

		view.renderList();

		const empty = container.querySelector<HTMLElement>(".smart-explorer-empty")!;
		expect(empty.textContent).toBe("No files in vault.");
		expect(empty.getAttribute("role")).toBe("status");
		expect(empty.querySelector(".smart-explorer-clear-btn")).toBeNull();
	});

	it("distinguishes files hidden by extension settings without offering a clear action", () => {
		const { view, container } = makeView();
		view.plugin.settings.hiddenExtensions = ["pdf"];
		view.fileIndex = {
			getAll: () => [makeRecord("private/report.pdf", "pdf")],
			getFolderPaths: () => ["private"],
		};

		view.renderList();

		const empty = container.querySelector<HTMLElement>(".smart-explorer-empty")!;
		expect(empty.textContent).toBe("All files are hidden by extension settings.");
		expect(empty.getAttribute("role")).toBe("status");
		expect(empty.querySelector(".smart-explorer-clear-btn")).toBeNull();
	});

	it("offers a clear action only when search or filters have no matches", () => {
		const { view, container } = makeView();
		view.fileIndex = {
			getAll: () => [makeRecord("notes/one.md", "md")],
			getFolderPaths: () => ["notes"],
		};
		view.query.searchText = "missing";

		view.renderList();

		const empty = container.querySelector<HTMLElement>(".smart-explorer-empty")!;
		expect(empty.firstElementChild?.textContent).toBe("No files match the current search or filters.");
		expect(empty.getAttribute("role")).toBe("status");
		expect(empty.querySelector(".smart-explorer-clear-btn")).not.toBeNull();
		expect(container.querySelector(".smart-explorer-file-count")?.textContent).toBe("0 of 1 file");
	});

	it("renders folder-only vaults as a tree instead of an empty vault", () => {
		const { view, container } = makeView();
		view.fileIndex = { getAll: () => [], getFolderPaths: () => ["notes"] };
		view.viewMode = "tree";

		view.renderList();

		expect(container.querySelector(".smart-explorer-empty")).toBeNull();
		expect(container.querySelector(".smart-explorer-tree-folder-summary")?.textContent).toContain("notes");
	});

	it("shows the file-empty state in list mode without enumerating folders", () => {
		const { view, container } = makeView();
		const getFolderPaths = jest.fn(() => ["notes"]);
		view.fileIndex = { getAll: () => [], getFolderPaths };
		view.viewMode = "list";

		view.renderList();

		expect(container.querySelector(".smart-explorer-empty")?.textContent).toBe("No files in vault.");
		expect(getFolderPaths).not.toHaveBeenCalled();
	});

	it("clears populated count and visible folders when the vault becomes empty", () => {
		const { view, container } = makeView();
		let records = [makeRecord("notes/one.md", "md")];
		let folders = ["notes"];
		view.fileIndex = {
			getAll: () => records,
			getFolderPaths: () => folders,
		};
		view.viewMode = "tree";

		view.renderList();
		expect(container.querySelector(".smart-explorer-file-count")?.textContent).toBe("1 file");
		expect(view.visibleTreeFolderPaths).toEqual(["notes"]);

		records = [];
		folders = [];
		view.renderList();

		expect(container.querySelector(".smart-explorer-file-count")?.textContent).toBe("0 files");
		expect(view.visibleTreeFolderPaths).toEqual([]);
	});

	it("finalizes count and manual controls when visible files become hidden", () => {
		const { view, container } = makeView();
		view.fileIndex = {
			getAll: () => [makeRecord("report.pdf", "pdf")],
			getFolderPaths: jest.fn(),
		};
		view.viewMode = "list";

		view.renderList();
		expect(container.querySelector(".smart-explorer-file-count")?.textContent).toBe("1 file");
		view.query.sort = "manual";
		view.updateManualOrderControls();
		expect(container.querySelector(".smart-explorer-list")?.classList.contains("is-manual-sorting")).toBe(true);

		view.query.sort = "name-asc";
		view.plugin.settings.hiddenExtensions = ["pdf"];
		view.renderList();

		expect(container.querySelector(".smart-explorer-file-count")?.textContent).toBe("0 files");
		expect(container.querySelector(".smart-explorer-list")?.classList.contains("is-manual-sorting")).toBe(false);
		expect(container.querySelector(".smart-explorer-manual-hint")?.classList.contains("is-hidden")).toBe(true);
		expect(container.querySelector(".smart-explorer-manual-undo")?.classList.contains("is-hidden")).toBe(true);
	});

	it("synchronizes view-mode and manual controls in no-match states", () => {
		const { view, container } = makeView();
		view.fileIndex = {
			getAll: () => [makeRecord("notes/one.md", "md")],
			getFolderPaths: jest.fn(() => ["notes"]),
		};
		view.query.searchText = "missing";
		view.viewMode = "list";
		const viewModeButton = container.querySelector<HTMLButtonElement>(".smart-explorer-view-mode")!;
		const setIconMock = jest.mocked(setIcon);
		setIconMock.mockClear();

		view.renderList();

		expect(viewModeButton.getAttribute("aria-label")).toBe("List view");
		expect(viewModeButton.classList.contains("is-active")).toBe(false);
		expect(setIconMock).toHaveBeenCalledWith(viewModeButton, "list");

		view.viewMode = "tree";
		setIconMock.mockClear();
		view.renderList();

		expect(viewModeButton.getAttribute("aria-label")).toBe("Tree view");
		expect(viewModeButton.classList.contains("is-active")).toBe(true);
		expect(setIconMock).toHaveBeenCalledWith(viewModeButton, "folder-tree");

		view.query.sort = "manual";
		setIconMock.mockClear();
		view.renderList();

		expect(viewModeButton.getAttribute("aria-label")).toBe("Manual sort uses list view");
		expect(viewModeButton.classList.contains("is-active")).toBe(false);
		expect(setIconMock).toHaveBeenCalledWith(viewModeButton, "list");
		expect(container.querySelector(".smart-explorer-list")?.classList.contains("is-manual-sorting")).toBe(true);
		expect(container.querySelector(".smart-explorer-manual-hint")?.classList.contains("is-hidden")).toBe(false);
		expect(container.querySelector(".smart-explorer-manual-undo")?.classList.contains("is-hidden")).toBe(false);
	});

	it.each([
		["create-note", "File name"],
		["create-folder", "Folder name"],
	])("keeps a filtered %s input mounted in its target folder branch", (kind, ariaLabel) => {
		const { view, container } = makeView();
		const getFolderPaths = jest.fn(() => ["Archive"]);
		view.fileIndex = {
			getAll: () => [makeRecord("Archive/visible.md", "md")],
			getFolderPaths,
		};
		view.viewMode = "tree";
		view.query.searchText = "missing";
		view.inlineEdit = { kind, folderPath: "Projects/Atlas", value: "Draft" };

		view.renderList();

		const folders = Array.from(
			container.querySelectorAll<HTMLElement>(".smart-explorer-tree-folder-summary .smart-explorer-tree-name"),
			(folder) => folder.textContent,
		);
		expect(folders).toEqual(["Projects", "Atlas"]);
		expect(container.querySelector<HTMLInputElement>(`.smart-explorer-inline-input[aria-label="${ariaLabel}"]`))
			.not.toBeNull();
		expect(getFolderPaths).not.toHaveBeenCalled();
	});

	it("sorts extension options and clears a selection that is no longer available", () => {
		const { view, container } = makeView();
		view.query.extension = "pdf";

		view.syncExtensionOptions([
			makeRecord("z.png", "png"),
			makeRecord("a.md", "md"),
			makeRecord("duplicate.md", "md"),
			makeRecord("empty", ""),
			makeRecord("report.pdf", "pdf"),
			makeRecord("v10.v10", "v10"),
			makeRecord("v2.v2", "v2"),
		]);

		const select = container.querySelector<HTMLSelectElement>(".smart-explorer-extension")!;
		expect(Array.from(select.options, (option) => [option.value, option.text])).toEqual([
			["", "All extensions"],
			["md", ".md"],
			["pdf", ".pdf"],
			["png", ".png"],
			["v2", ".v2"],
			["v10", ".v10"],
		]);
		expect(select.value).toBe("pdf");
		view.updateFileCount(1, 2);
		expect(container.querySelector(".smart-explorer-filter-toggle")?.classList.contains("is-active")).toBe(true);

		view.syncExtensionOptions([makeRecord("a.md", "md")]);

		expect(view.query.extension).toBeNull();
		expect(select.value).toBe("");
		expect(container.querySelector(".smart-explorer-filter-toggle")?.classList.contains("is-active")).toBe(false);
	});

	it("keeps extension filtering when the file kind changes", () => {
		const { view, container } = makeView();
		view.renderList = jest.fn();
		view.syncExtensionOptions([makeRecord("report.pdf", "pdf")]);
		const extension = container.querySelector<HTMLSelectElement>(".smart-explorer-extension")!;
		const kind = container.querySelector<HTMLSelectElement>(".smart-explorer-kind")!;

		extension.value = "pdf";
		extension.dispatchEvent(new Event("change"));
		kind.value = "non-markdown";
		kind.dispatchEvent(new Event("change"));

		expect(view.query.extension).toBe("pdf");
		expect(view.query.fileKind).toBe("non-markdown");
		expect(view.renderList).toHaveBeenCalledTimes(2);
	});

	it("syncs extensions after hidden-extension projection and before filtering records", () => {
		const { view, container } = makeView();
		view.plugin.settings.hiddenExtensions = ["pdf"];
		view.fileIndex = {
			getAll: () => [makeRecord("visible.md", "md"), makeRecord("hidden.pdf", "pdf")],
			getFolderPaths: () => [],
		};
		view.viewMode = "list";
		view.query.extension = "pdf";

		view.renderList();

		const extension = container.querySelector<HTMLSelectElement>(".smart-explorer-extension")!;
		expect(Array.from(extension.options, (option) => option.value)).toEqual(["", "md"]);
		expect(view.query.extension).toBeNull();
		expect(container.querySelector<HTMLElement>('[data-path="visible.md"]')).not.toBeNull();
		expect(container.querySelector<HTMLElement>('[data-path="hidden.pdf"]')).toBeNull();
	});

	it("gives every select an accessible label", () => {
		const { container } = makeView();

		expect(Array.from(container.querySelectorAll("select"), (select) => select.getAttribute("aria-label")))
			.toEqual(["Sort order", "Group files", "File kind", "File extension", "Modified date"]);
	});

	it("keeps disclosure labels, expanded state, and active state in sync", () => {
		const { view, container } = makeView();
		view.renderList = jest.fn();
		const searchButton = container.querySelector<HTMLButtonElement>(".smart-explorer-search-toggle")!;
		const filterButton = container.querySelector<HTMLButtonElement>(".smart-explorer-filter-toggle")!;
		const searchPanel = container.querySelector<HTMLElement>(".smart-explorer-search-row")!;
		const filterPanel = container.querySelector<HTMLElement>(".smart-explorer-toolbar-filters")!;

		expect(searchButton.getAttribute("aria-label")).toBe("Show search");
		expect(searchButton.getAttribute("aria-expanded")).toBe("false");
		expect(filterButton.getAttribute("aria-label")).toBe("Show filters");
		expect(filterButton.getAttribute("aria-expanded")).toBe("false");

		searchButton.click();
		expect(searchPanel.classList.contains("is-collapsed")).toBe(false);
		expect(searchButton.getAttribute("aria-label")).toBe("Hide search");
		expect(searchButton.getAttribute("aria-expanded")).toBe("true");
		expect(searchButton.classList.contains("is-active")).toBe(true);

		searchButton.click();
		view.query.searchText = "needle";
		view.updateFileCount(1, 2);
		expect(searchButton.getAttribute("aria-label")).toBe("Show search");
		expect(searchButton.getAttribute("aria-expanded")).toBe("false");
		expect(searchButton.classList.contains("is-active")).toBe(true);

		filterButton.click();
		expect(filterPanel.classList.contains("is-collapsed")).toBe(false);
		expect(filterButton.getAttribute("aria-label")).toBe("Hide filters");
		expect(filterButton.getAttribute("aria-expanded")).toBe("true");

		container.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(searchButton.classList.contains("is-active")).toBe(false);
		container.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(filterPanel.classList.contains("is-collapsed")).toBe(true);
		expect(filterButton.getAttribute("aria-label")).toBe("Show filters");
		expect(filterButton.getAttribute("aria-expanded")).toBe("false");

		view.query.fileKind = "images";
		view.rebuildView();
		const rebuiltButton = container.querySelector<HTMLButtonElement>(".smart-explorer-filter-toggle")!;
		expect(rebuiltButton.getAttribute("aria-label")).toBe("Show filters");
		expect(rebuiltButton.getAttribute("aria-expanded")).toBe("false");
		expect(rebuiltButton.classList.contains("is-active")).toBe(true);
	});

	it("uses unique panel IDs for every view instance", () => {
		const first = makeView().container;
		const second = makeView().container;
		const panels = [
			first.querySelector<HTMLElement>(".smart-explorer-search-row")!,
			first.querySelector<HTMLElement>(".smart-explorer-toolbar-filters")!,
			second.querySelector<HTMLElement>(".smart-explorer-search-row")!,
			second.querySelector<HTMLElement>(".smart-explorer-toolbar-filters")!,
		];
		const buttons = [
			first.querySelector<HTMLButtonElement>(".smart-explorer-search-toggle")!,
			first.querySelector<HTMLButtonElement>(".smart-explorer-filter-toggle")!,
			second.querySelector<HTMLButtonElement>(".smart-explorer-search-toggle")!,
			second.querySelector<HTMLButtonElement>(".smart-explorer-filter-toggle")!,
		];

		expect(new Set(panels.map((panel) => panel.id)).size).toBe(4);
		expect(panels.every((panel) => panel.id.length > 0)).toBe(true);
		expect(buttons.map((button) => button.getAttribute("aria-controls")))
			.toEqual(panels.map((panel) => panel.id));
	});
});

describe("SmartExplorerView container focus model", () => {
	function setupList(view: any) {
		view.fileIndex = {
			getAll: () => ["a.md", "b.md", "c.md"].map((path) => makeRecord(path, "md")),
			getFolderPaths: jest.fn(() => []),
			get: (path: string) => makeRecord(path, "md"),
		};
		view.viewMode = "list";
		view.renderList();
	}

	function setupTree(view: any) {
		view.fileIndex = {
			getAll: () => [makeRecord("notes/one.md", "md")].concat(
				Array.from({ length: 2 }, (_, i) => makeRecord(`root-${i}.md`, "md")),
			),
			getFolderPaths: () => ["notes"],
			get: (path: string) => makeRecord(path, "md"),
		};
		view.viewMode = "tree";
		view.renderList();
	}

	function keydown(el: Element, init: KeyboardEventInit) {
		el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
	}

	it("gives the composite container the only tab stop with stable item ids", () => {
		const { view, container } = makeView();
		setupList(view);
		const list = container.querySelector<HTMLElement>(".smart-explorer-list")!;

		expect(list.getAttribute("tabindex")).toBe("0");
		const rows = Array.from(container.querySelectorAll<HTMLElement>(".smart-explorer-row"));
		expect(rows.every((row) => row.getAttribute("tabindex") === null)).toBe(true);
		expect(rows[0]!.id).toMatch(/^smart-explorer-\d+-item-/);
		expect(rows[0]!.dataset.navPath).toBe("a.md");
	});

	it("applies mode-dependent container roles and initial active descendant", () => {
		const { view, container } = makeView();
		setupList(view);
		const list = container.querySelector<HTMLElement>(".smart-explorer-list")!;
		expect(list.getAttribute("role")).toBe("listbox");
		expect(list.getAttribute("aria-label")).toBe("Vault file list");
		expect(list.getAttribute("aria-activedescendant")).toBe(container.querySelector(".smart-explorer-row")!.id);

		view.viewMode = "tree";
		view.renderList();
		expect(list.getAttribute("role")).toBe("tree");
		expect(list.getAttribute("aria-label")).toBe("Vault files");
	});

	it("moves the active item with Arrow/Home/End while DOM focus stays on the container", () => {
		const { view, container } = makeView();
		document.body.appendChild(container);
		try {
			setupList(view);
			const list = container.querySelector<HTMLElement>(".smart-explorer-list")!;
			const rows = () => Array.from(container.querySelectorAll<HTMLElement>(".smart-explorer-row"));
			list.focus();
			expect(document.activeElement).toBe(list);

			keydown(list, { key: "ArrowDown" });
			expect(list.getAttribute("aria-activedescendant")).toBe(rows()[1]!.id);
			expect(rows()[1]!.classList.contains("is-keyboard-active")).toBe(true);
			expect(rows()[0]!.classList.contains("is-keyboard-active")).toBe(false);
			expect(document.activeElement).toBe(list);

			keydown(list, { key: "End" });
			expect(list.getAttribute("aria-activedescendant")).toBe(rows()[2]!.id);
			keydown(list, { key: "Home" });
			expect(list.getAttribute("aria-activedescendant")).toBe(rows()[0]!.id);
			keydown(list, { key: "ArrowUp" });
			expect(list.getAttribute("aria-activedescendant")).toBe(rows()[0]!.id);
		} finally {
			document.body.removeChild(container);
		}
	});

	it("restores the keyboard-active class after a full render", () => {
		const { view, container } = makeView();
		setupList(view);
		const list = container.querySelector<HTMLElement>(".smart-explorer-list")!;

		keydown(list, { key: "ArrowDown" });
		expect(view.activeItemPath).toBe("b.md");

		view.renderList();

		const activeRow = container.querySelector<HTMLElement>('[data-path="b.md"]')!;
		expect(activeRow.classList.contains("is-keyboard-active")).toBe(true);
		expect(list.getAttribute("aria-activedescendant")).toBe(activeRow.id);
	});

	it("activates the active file on Enter", () => {
		const { view, container } = makeView();
		setupList(view);
		view.openFile = jest.fn();
		const list = container.querySelector<HTMLElement>(".smart-explorer-list")!;

		keydown(list, { key: "ArrowDown" });
		keydown(list, { key: "Enter" });

		expect(view.openFile).toHaveBeenCalledWith("b.md");
		expect(view.selectedPath).toBe("b.md");
		expect(view.selectedFolderPath).toBeNull();
	});

	it("expands and collapses folders from the keyboard with truthful aria-expanded", () => {
		const { view, container } = makeView();
		setupTree(view);
		const list = container.querySelector<HTMLElement>(".smart-explorer-list")!;
		const summary = container.querySelector<HTMLElement>(".smart-explorer-tree-folder-summary")!;
		const details = summary.closest("details")!;
		expect(details.open).toBe(false);
		expect(summary.getAttribute("aria-expanded")).toBe("false");

		keydown(list, { key: "Home" });
		expect(list.getAttribute("aria-activedescendant")).toBe(summary.id);
		keydown(list, { key: "ArrowRight" });
		expect(details.open).toBe(true);
		expect(summary.getAttribute("aria-expanded")).toBe("true");

		keydown(list, { key: "ArrowLeft" });
		expect(details.open).toBe(false);
		expect(summary.getAttribute("aria-expanded")).toBe("false");
	});

	it("moves the active item to the folder when it closes over an active descendant", () => {
		const { view, container } = makeView();
		setupTree(view);
		const list = container.querySelector<HTMLElement>(".smart-explorer-list")!;
		const summary = container.querySelector<HTMLElement>(".smart-explorer-tree-folder-summary")!;
		const details = summary.closest("details")!;

		keydown(list, { key: "Home" });
		keydown(list, { key: "ArrowRight" });
		keydown(list, { key: "ArrowDown" });
		const fileRow = container.querySelector<HTMLElement>('.smart-explorer-row[data-path="notes/one.md"]')!;
		expect(list.getAttribute("aria-activedescendant")).toBe(fileRow.id);

		details.open = false;
		details.dispatchEvent(new Event("toggle"));

		expect(list.getAttribute("aria-activedescendant")).toBe(summary.id);
		expect(summary.classList.contains("is-keyboard-active")).toBe(true);
	});

	it("reorders manually with Alt+Arrow and announces the new position", () => {
		const { view, container } = makeView();
		document.body.appendChild(container);
		try {
			view.plugin.settings.manualOrder = [];
			setupList(view);
			view.query.sort = "manual";
			view.renderList();
			const list = container.querySelector<HTMLElement>(".smart-explorer-list")!;
			list.focus();

			keydown(list, { key: "ArrowDown" });
			keydown(list, { key: "ArrowDown", altKey: true });

			expect(view.plugin.settings.manualOrder).toEqual(["a.md", "c.md", "b.md"]);
			expect(container.querySelector(".smart-explorer-sr-only")?.textContent)
				.toBe("Moved b.md to position 3 of 3.");
			const movedRow = container.querySelector<HTMLElement>('.smart-explorer-row[data-path="b.md"]')!;
			expect(list.getAttribute("aria-activedescendant")).toBe(movedRow.id);
			expect(document.activeElement).toBe(list);
		} finally {
			document.body.removeChild(container);
		}
	});
});

describe("SmartExplorerView lazy tree mounting", () => {
	it("does not mount descendants of a closed folder until it opens", () => {
		const view = Object.create(SmartExplorerView.prototype) as any;
		view.query = {
			searchText: "", sort: "name-asc", group: "none",
			extension: null, fileKind: "all", modifiedWithinDays: null,
		};
		view.treeExpandedPaths = new Set<string>();
		view.selectedPath = null;
		view.selectedFolderPath = null;
		view.activeItemPath = null;
		view.inlineEdit = null;
		view.updateTreeToggleControl = jest.fn();
		view.showTooltip = jest.fn();
		view.hideTooltip = jest.fn();
		view.attachLongPressMenu = jest.fn();
		view.plugin = { settings: { manualOrder: [] } };
		view.getItemDomId = SmartExplorerView.prototype["getItemDomId"];
		view.createRowElement = (record: FileRecord) => {
			const row = document.createElement("div");
			row.className = "smart-explorer-row";
			row.dataset.path = record.path;
			return row;
		};
		const tree = buildTree(
			Array.from({ length: 1000 }, (_, index) => makeRecord(`closed/file-${index}.md`, "md")),
			view.query,
		);
		const folder = tree.children[0] as any;

		const details = view.createTreeNodeElement(folder) as HTMLDetailsElement;
		expect(details.querySelectorAll(".smart-explorer-row")).toHaveLength(0);

		details.open = true;
		details.dispatchEvent(new Event("toggle"));
		expect(details.querySelectorAll(".smart-explorer-row")).toHaveLength(1000);

		details.open = false;
		details.dispatchEvent(new Event("toggle"));
		expect(details.querySelectorAll(".smart-explorer-row")).toHaveLength(0);
	});
});

describe("SmartExplorerView windowed list rendering", () => {
	it("windowes large flat lists and keeps keyboard state on the container", () => {
		const { view, container } = makeView();
		document.body.appendChild(container);
		try {
			view.fileIndex = {
				getAll: () => Array.from({ length: 500 }, (_, i) => makeRecord(`f${i}.md`, "md")),
				getFolderPaths: jest.fn(() => []),
				get: (path: string) => makeRecord(path, "md"),
			};
			view.viewMode = "list";
			view.renderList();

			expect(container.querySelectorAll(".smart-explorer-row").length).toBeLessThanOrEqual(21);
			const list = container.querySelector<HTMLElement>(".smart-explorer-list")!;
			list.focus();

			list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
			expect(view.activeItemPath).toBe("f1.md");
			expect(document.activeElement).toBe(list);
			const row = container.querySelector<HTMLElement>('[data-path="f1.md"]');
			expect(row).not.toBeNull();
			expect(list.getAttribute("aria-activedescendant")).toBe(row!.id);

			list.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
			expect(view.activeItemPath).toBe("f499.md");
			const last = container.querySelector<HTMLElement>('[data-path="f499.md"]');
			expect(last).not.toBeNull();
			expect(list.getAttribute("aria-activedescendant")).toBe(last!.id);
			expect(last!.getAttribute("aria-posinset")).toBe("500");
			expect(last!.getAttribute("aria-setsize")).toBe("500");
		} finally {
			document.body.removeChild(container);
		}
	});

	it("preserves an offscreen active item across a full render", () => {
		jest.useFakeTimers();
		const { view, container } = makeView();
		document.body.appendChild(container);
		try {
			view.fileIndex = {
				getAll: () => Array.from({ length: 500 }, (_, i) => makeRecord(`f${i}.md`, "md")),
				getFolderPaths: jest.fn(() => []),
				get: (path: string) => makeRecord(path, "md"),
			};
			view.viewMode = "list";
			view.renderList();
			const list = container.querySelector<HTMLElement>(".smart-explorer-list")!;
			Object.defineProperty(list, "clientHeight", { value: 440, configurable: true });
			view.setActiveItem("f0.md");

			list.scrollTop = 100 * 44;
			list.dispatchEvent(new Event("scroll"));
			jest.runOnlyPendingTimers();
			expect(container.querySelector('[data-path="f0.md"]')).not.toBeNull();

			view.renderList();

			expect(view.activeItemPath).toBe("f0.md");
			expect(container.querySelector('[data-path="f0.md"]')).not.toBeNull();
		} finally {
			document.body.removeChild(container);
			jest.useRealTimers();
		}
	});
});

describe("SmartExplorerView close persistence", () => {
	it("awaits a pending manual-order save before close completes", async () => {
		const view = Object.create(SmartExplorerView.prototype) as any;
		view.searchRenderScheduler = { cancel: jest.fn() };
		view.tooltipEl = null;
		view.virtualList = null;
		view.dragSortManager = null;
		view.listContainer = null;
		view.rebuildTimeout = null;
		view.saveOrderTimeout = window.setTimeout(() => {}, 10000);
		const order: string[] = [];
		view.plugin = {
			saveSettingsWithNotice: jest.fn(async () => {
				order.push("save");
			}),
			flushSettings: jest.fn(async () => {
				order.push("flush");
			}),
		};

		await view.onClose();

		expect(order).toEqual(["save", "flush"]);
		expect(view.saveOrderTimeout).toBeNull();
	});
});

describe("SmartExplorerView workspace selection sync", () => {
	it("syncs selection on file-open without scrolling or expanding folders", () => {
		const { view, container } = makeView();
		document.body.appendChild(container);
		try {
			view.fileIndex = {
				getAll: () => [makeRecord("notes/one.md", "md"), makeRecord("notes/two.md", "md")],
				getFolderPaths: () => ["notes"],
			};
			view.viewMode = "list";
			view.renderList();
			const list = container.querySelector<HTMLElement>(".smart-explorer-list")!;
			list.scrollTop = 120;

			let fileOpenHandler: ((file: any) => void) | null = null;
			view.plugin.app = {
				vault: { on: jest.fn() },
				workspace: { on: (_name: string, cb: (file: { path: string } | null) => void) => { fileOpenHandler = cb; } },
			};
			view.registerVaultEvents();

			const { TFile } = jest.requireMock("obsidian") as { TFile: new () => any };
			const openedFile = new TFile();
			openedFile.path = "notes/two.md";
			fileOpenHandler!(openedFile);
			const row = container.querySelector<HTMLElement>('.smart-explorer-row[data-path="notes/two.md"]')!;
			expect(view.selectedPath).toBe("notes/two.md");
			expect(row.classList.contains("is-selected")).toBe(true);
			expect(row.getAttribute("aria-selected")).toBe("true");
			expect(list.scrollTop).toBe(120);
			expect(view.treeExpandedPaths.size).toBe(0);

			fileOpenHandler!(null);
			expect(view.selectedPath).toBeNull();
			expect(row.classList.contains("is-selected")).toBe(false);
			expect(row.getAttribute("aria-selected")).toBe("false");
			expect(list.scrollTop).toBe(120);
		} finally {
			document.body.removeChild(container);
		}
	});

	it("purges deleted folder subtrees from the index and manual-order reconcile flag", () => {
		const { view } = makeView();
		const removeFolder = jest.fn();
		const addFolder = jest.fn();
		const scheduleRebuild = jest.fn();
		view.scheduleRebuild = scheduleRebuild;
		view.collapseFolderPath = jest.fn();
		view.fileIndex = { removeFolder, addFolder };
		let vaultHandlers: Record<string, (file: unknown, oldPath?: string) => void> = {};
		view.plugin.app = {
			vault: { on: (name: string, cb: (file: unknown, oldPath?: string) => void) => { vaultHandlers[name] = cb; } },
			workspace: { on: jest.fn() },
		};
		view.registerVaultEvents();

		const folder = { constructor: Object };
		Object.setPrototypeOf(folder, { [Symbol.toStringTag]: "TFolder" });
		vaultHandlers.delete!(folder);
		expect(removeFolder).not.toHaveBeenCalled();

		// Real TFolder instances flow through the instanceof branch.
		const { TFolder } = jest.requireMock("obsidian") as { TFolder: new () => unknown };
		const realFolder = new (TFolder as new () => any)();
		realFolder.path = "gone";
		vaultHandlers.delete!(realFolder);
		expect(removeFolder).toHaveBeenCalledWith("gone");
		expect(view.manualOrderNeedsReconcile).toBe(true);

		const newFolder = new (TFolder as new () => any)();
		newFolder.path = "created";
		view.manualOrderNeedsReconcile = false;
		vaultHandlers.create!(newFolder);
		expect(addFolder).toHaveBeenCalledWith("created");
		expect(view.manualOrderNeedsReconcile).toBe(true);
	});
});
