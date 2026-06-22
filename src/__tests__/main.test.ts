jest.mock(
	"obsidian",
	() => ({
		Plugin: class {
			app: any;
			async loadData() {
				return null;
			}
			async saveData(_data: unknown) {}
			registerView() {}
			addRibbonIcon() {}
			addCommand() {}
			addSettingTab() {}
		},
		ItemView: class {},
		Modal: class {
			contentEl = { empty: jest.fn() };
			setTitle() {}
			open() {}
			close() {}
		},
		Notice: class {},
		PluginSettingTab: class {},
		Setting: class {},
		Platform: { isMobile: false },
		Menu: class {},
		setIcon: jest.fn(),
		TFile: class {},
		TFolder: class {},
	}),
	{ virtual: true },
);

import SmartExplorerPlugin from "../main";

describe("SmartExplorerPlugin", () => {
	it("opens the smart explorer in the left sidebar by default", async () => {
		const leftLeaf = {
			setViewState: jest.fn().mockResolvedValue(undefined),
		};
		const workspace = {
			getLeavesOfType: jest.fn().mockReturnValue([]),
			getLeftLeaf: jest.fn().mockReturnValue(leftLeaf),
			getRightLeaf: jest.fn(),
			revealLeaf: jest.fn(),
		};
		const plugin = new SmartExplorerPlugin({} as any, {} as any);
		(plugin as any).app = { workspace };

		await plugin.activateView();

		expect(workspace.getLeftLeaf).toHaveBeenCalledWith(false);
		expect(workspace.getRightLeaf).not.toHaveBeenCalled();
		expect(leftLeaf.setViewState).toHaveBeenCalledWith({
			type: "smart-explorer",
			active: true,
		});
		expect(workspace.revealLeaf).toHaveBeenCalledWith(leftLeaf);
	});
});
