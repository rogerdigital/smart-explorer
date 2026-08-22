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
		expect(first.view.plugin.saveSettings).toHaveBeenCalledTimes(1);
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
