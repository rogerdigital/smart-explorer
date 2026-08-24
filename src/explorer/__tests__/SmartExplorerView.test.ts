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

	it("clears reset undo history, disables Undo, and prevents restoring old order", () => {
		const view = makeBareView([]);
		view.query = { sort: "manual" };
		view.manualOrderUndoStack = [["old-a.md", "old-b.md"]];
		view.manualUndoBtn = {
			classList: { toggle: jest.fn() },
			disabled: false,
		};
		view.listContainer = null;
		view.manualHintEl = null;
		view.renderList = jest.fn();

		view.resetManualOrderState();
		view.undoManualReorder();

		expect(view.manualOrderUndoStack).toEqual([]);
		expect(view.manualUndoBtn.disabled).toBe(true);
		expect(view.renderList).toHaveBeenCalledTimes(1);
		expect(view.plugin.settings.manualOrder).toEqual([]);
		expect(view.scheduleSaveOrder).not.toHaveBeenCalled();
	});
});

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

describe("SmartExplorerView settings projection", () => {
	it("rerenders without replacing leaf-local mode, sort, or group", () => {
		const view = Object.create(SmartExplorerView.prototype) as any;
		view.viewMode = "list";
		view.query = { sort: "size", group: "extension" };
		view.manualOrderUndoStack = [["a.md"]];
		view.renderList = jest.fn();

		view.refreshSettingsProjection();

		expect(view.viewMode).toBe("list");
		expect(view.query).toMatchObject({ sort: "size", group: "extension" });
		expect(view.manualOrderUndoStack).toEqual([["a.md"]]);
		expect(view.renderList).toHaveBeenCalledTimes(1);
	});
});

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

	it("leaves manual sort so tree reveal can become effective", () => {
		const view = Object.create(SmartExplorerView.prototype) as any;
		view.app = {
			workspace: {
				getActiveFile: () => ({ path: "notes/active.md" }),
			},
		};
		view.query = {
			searchText: "other",
			sort: "manual",
			group: "none",
			extension: null,
			fileKind: "all",
			modifiedWithinDays: null,
		};
		view.manualSeedSort = "modified-new";
		view.viewMode = "list";
		view.selectedPath = null;
		view.selectedFolderPath = null;
		view.treeExpandedPaths = new Set<string>();
		view.searchRenderScheduler = { cancel: jest.fn() };
		view.rebuildView = jest.fn();
		view.listContainer = null;

		view.revealActiveFile();

		expect(view.query.sort).toBe("modified-new");
		expect(view.viewMode).toBe("tree");
		expect(view.resolvedViewMode()).toBe("tree");
		expect(view.rebuildView).toHaveBeenCalledTimes(1);
	});
});

