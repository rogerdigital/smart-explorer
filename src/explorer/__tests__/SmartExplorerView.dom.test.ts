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
import { SmartExplorerView } from "../SmartExplorerView";

function makeRecord(path: string, extension: string): FileRecord {
	return {
		path,
		basename: path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? path,
		extension,
		parentPath: "",
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
			hiddenExtensions: [],
			manualOrder: [],
		},
		saveSettings: jest.fn(),
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
