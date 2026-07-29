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
