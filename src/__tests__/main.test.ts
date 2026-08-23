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
import { SmartExplorerView } from "../explorer/SmartExplorerView";

describe("SmartExplorerPlugin", () => {
	it("normalizes persisted settings when loading", async () => {
		const plugin = new SmartExplorerPlugin({} as any, {} as any);
		(plugin as any).loadData = jest.fn().mockResolvedValue({
			defaultSort: "corrupt",
			defaultGroup: "folder",
			lastViewMode: "list",
			hiddenExtensions: [".PNG", 3],
			manualOrder: ["b", "b", "a"],
		});

		await plugin.loadSettings();

		expect(plugin.settings).toEqual({
			defaultSort: "name-asc",
			defaultGroup: "folder",
			lastViewMode: "list",
			hiddenExtensions: ["png"],
			manualOrder: ["b", "a"],
		});
	});

	it("refreshes settings projections only for Smart Explorer views", () => {
		const explorer = Object.create(SmartExplorerView.prototype) as SmartExplorerView;
		(explorer as any).refreshSettingsProjection = jest.fn();
		const otherView = { refreshSettingsProjection: jest.fn() };
		const plugin = new SmartExplorerPlugin({} as any, {} as any);
		(plugin as any).app = {
			workspace: {
				getLeavesOfType: jest.fn().mockReturnValue([
					{ view: explorer },
					{ view: otherView },
				]),
			},
		};

		plugin.refreshExplorerViews();

		expect((explorer as any).refreshSettingsProjection).toHaveBeenCalledTimes(1);
		expect(otherView.refreshSettingsProjection).not.toHaveBeenCalled();
	});

	it("resets manual-order state in every open Smart Explorer view", () => {
		const first = Object.create(SmartExplorerView.prototype) as SmartExplorerView;
		const second = Object.create(SmartExplorerView.prototype) as SmartExplorerView;
		(first as any).resetManualOrderState = jest.fn();
		(second as any).resetManualOrderState = jest.fn();
		const otherView = { resetManualOrderState: jest.fn() };
		const plugin = new SmartExplorerPlugin({} as any, {} as any);
		(plugin as any).app = {
			workspace: {
				getLeavesOfType: jest.fn().mockReturnValue([
					{ view: first },
					{ view: second },
					{ view: otherView },
				]),
			},
		};

		plugin.resetExplorerManualOrderViews();

		expect((first as any).resetManualOrderState).toHaveBeenCalledTimes(1);
		expect((second as any).resetManualOrderState).toHaveBeenCalledTimes(1);
		expect(otherView.resetManualOrderState).not.toHaveBeenCalled();
	});

	it("registers command palette actions for core explorer workflows", async () => {
		const commands: { id: string; name: string }[] = [];
		const plugin = new SmartExplorerPlugin({} as any, {} as any);
		(plugin as any).app = { workspace: {} };
		(plugin as any).registerView = jest.fn();
		(plugin as any).addRibbonIcon = jest.fn();
		(plugin as any).addCommand = jest.fn((command) => {
			commands.push({ id: command.id, name: command.name });
		});
		(plugin as any).addSettingTab = jest.fn();

		await plugin.onload();

		expect(commands).toEqual([
			{ id: "open", name: "Open" },
			{ id: "focus-search", name: "Focus search" },
			{ id: "reveal-active-file", name: "Reveal active file" },
			{ id: "new-note", name: "New note" },
			{ id: "new-folder", name: "New folder" },
		]);
	});

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
	it("serializes immutable settings snapshots", async () => {
		let resolveFirst!: () => void;
		const firstWrite = new Promise<void>((resolve) => { resolveFirst = resolve; });
		const plugin = new SmartExplorerPlugin({} as any, {} as any);
		await plugin.loadSettings();
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
		const plugin = new SmartExplorerPlugin({} as any, {} as any);
		await plugin.loadSettings();
		plugin.saveData = jest.fn()
			.mockRejectedValueOnce(new Error("disk full"))
			.mockResolvedValueOnce(undefined);

		await expect(plugin.saveSettings()).rejects.toThrow("disk full");
		await expect(plugin.saveSettings()).resolves.toBeUndefined();
		expect(plugin.saveData).toHaveBeenCalledTimes(2);
	});

	it("notifies and recovers through saveSettingsWithNotice", async () => {
		const plugin = new SmartExplorerPlugin({} as any, {} as any);
		await plugin.loadSettings();
		plugin.saveData = jest.fn()
			.mockRejectedValueOnce(new Error("disk full"))
			.mockResolvedValueOnce(undefined);

		await expect(plugin.saveSettingsWithNotice("Could not save settings")).resolves.toBe(false);
		await expect(plugin.saveSettingsWithNotice("Could not save settings")).resolves.toBe(true);
	});

	it("flushes pending writes", async () => {
		let resolveWrite!: () => void;
		const write = new Promise<void>((resolve) => { resolveWrite = resolve; });
		const plugin = new SmartExplorerPlugin({} as any, {} as any);
		await plugin.loadSettings();
		plugin.saveData = jest.fn().mockReturnValueOnce(write);
		const saving = plugin.saveSettings();
		const flushed = plugin.flushSettings();
		resolveWrite();
		await Promise.all([saving, flushed]);
		expect(plugin.saveData).toHaveBeenCalledTimes(1);
	});

});
