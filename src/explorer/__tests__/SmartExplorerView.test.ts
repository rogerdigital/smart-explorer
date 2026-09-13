jest.mock(
	"obsidian",
	() => ({
		ItemView: class {},
		Menu: class {},
		Modal: class {},
		Notice: jest.fn(),
		Platform: { isMobile: false },
		Setting: class {},
		setIcon: jest.fn(),
		TFile: class {},
		TFolder: class {},
		WorkspaceLeaf: class {},
	}),
	{ virtual: true },
);

import { Notice, TFile, TFolder } from "obsidian";
import { reorderManualOrder } from "../manualOrder";
import { SmartExplorerView } from "../SmartExplorerView";

beforeEach(() => {
	jest.mocked(Notice).mockClear();
});

function makeBareView(order: string[]) {
	const view = Object.create(SmartExplorerView.prototype) as any;
	view.plugin = { settings: { manualOrder: order } };
	view.buildManualOrderIndex = jest.fn();
	view.scheduleSaveOrder = jest.fn();
	return view;
}

describe("SmartExplorerView manual-order state", () => {
	it("migrates every Undo snapshot without changing or saving shared order", () => {
		const view = makeBareView(["new/a.md", "b.md"]);
		view.manualOrderUndoStack = [["old/a.md", "b.md"], ["b.md", "old/a.md"]];
		view.updateManualOrderUndoAfterRename("old", "new");
		expect(view.manualOrderUndoStack).toEqual([["new/a.md", "b.md"], ["b.md", "new/a.md"]]);
		expect(view.plugin.settings.manualOrder).toEqual(["new/a.md", "b.md"]);
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



describe("rename API contract", () => {
	it.each([TFile, TFolder])("uses FileManager for %p", async (Kind) => {
		const isFile = Kind === TFile;
		const file = Object.assign(new Kind(), { path: isFile ? "notes/old.md" : "notes/old", basename: "old", extension: "md" });
		const view = Object.create(SmartExplorerView.prototype) as any;
		view.app = {
			vault: { getAbstractFileByPath: (path: string) => path === file.path ? file : null, rename: jest.fn() },
			fileManager: { renameFile: jest.fn().mockResolvedValue(undefined) },
		};
		view.renderList = jest.fn();
		await view.renameItemToName(file.path, "new");
		expect(view.app.fileManager.renameFile).toHaveBeenCalledWith(file, isFile ? "notes/new.md" : "notes/new");
		expect(view.app.vault.rename).not.toHaveBeenCalled();
		expect(view.selectedPath).toBe(isFile ? "notes/new.md" : null);
		expect(view.selectedFolderPath).toBe(isFile ? null : "notes/new");
		expect(Notice).not.toHaveBeenCalled();
	});
});

describe("Undo after vault changes", () => {
	it.each([
		["create", ["a.md", "b.md"], ["a.md", "b.md", "c.md"]],
		["delete", ["a.md", "b.md", "c.md"], ["b.md", "c.md"]],
		["unchanged", ["a.md", "b.md"], ["a.md", "b.md"]],
		["hidden and filtered", ["a.md", "b.md"], ["a.md", "b.md", "c.png"]],
	])("reconciles %s against the full index", (_name, history, paths) => {
		const records = (paths as string[]).map((path) => ({ path, basename: path.split(".")[0]!, extension: path.split(".")[1]!, parentPath: "", size: 0, ctime: 0, mtime: 0, isMarkdown: path.endsWith(".md") }));
		const view = makeBareView([...(paths as string[])].reverse());
		view.plugin.settings.hiddenExtensions = ["png"];
		view.query = { sort: "manual", group: "none", searchText: "a", extension: "md", fileKind: "markdown", modifiedWithinDays: 1 };
		view.manualSeedSort = "name-asc";
		view.manualOrderUndoStack = [history];
		view.manualOrderNeedsReconcile = false;
		view.fileIndex = { getAll: () => records };
		view.renderList = jest.fn();
		view.updateManualOrderControls = jest.fn();
		view.undoManualReorder();
		expect(view.plugin.settings.manualOrder).toEqual(paths);
		const last = (paths as string[])[(paths as string[]).length - 1]!;
		expect(reorderManualOrder(view.plugin.settings.manualOrder, last, 0, [{ id: "all", records }])[0]).toBe(last);
	});
});

describe("rename guards", () => {
	it.each(["collision", "unchanged", "missing", "rejected"])("preserves inline state for %s", async (scenario) => {
		const file = Object.assign(new TFile(), { path: "old.md", basename: "old", extension: "md" });
		const view = Object.create(SmartExplorerView.prototype) as any;
		view.inlineEdit = { kind: "rename-file", path: "old.md", value: "new" };
		view.selectedPath = "old.md";
		view.renderList = jest.fn();
		view.cancelInlineEdit = jest.fn();
		view.app = {
			vault: { getAbstractFileByPath: (path: string) => scenario === "missing" ? null : path === "old.md" ? file : scenario === "collision" ? new TFile() : null },
			fileManager: { renameFile: jest.fn().mockRejectedValue(new Error("disk full")) },
		};
		await expect(view.renameItemToName("old.md", scenario === "unchanged" ? "old" : "new")).resolves.toBeUndefined();
		expect(view.selectedPath).toBe("old.md");
		if (scenario === "rejected") {
			expect(view.app.fileManager.renameFile).toHaveBeenCalledTimes(1);
			expect(view.inlineEdit).not.toBeNull();
			expect(Notice).toHaveBeenCalledTimes(1);
			expect(Notice).toHaveBeenCalledWith("Could not rename item: disk full");
		} else {
			expect(view.app.fileManager.renameFile).not.toHaveBeenCalled();
			if (scenario === "collision") {
				expect(Notice).toHaveBeenCalledTimes(1);
				expect(Notice).toHaveBeenCalledWith("An item with that name already exists.");
			} else {
				expect(Notice).not.toHaveBeenCalled();
			}
		}
	});
});
