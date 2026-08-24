/** @jest-environment jsdom */

jest.mock(
	"obsidian",
	() => ({
		PluginSettingTab: class {},
		Setting: class {},
	}),
	{ virtual: true },
);

import { SmartExplorerSettingTab } from "../settings-tab";

type FakeButton = {
	setButtonText: jest.Mock<FakeButton, [string]>;
	onClick: jest.Mock<FakeButton, [callback: () => void]>;
	click?: () => void;
};

function makeButton(): FakeButton {
	const button = {} as FakeButton;
	button.setButtonText = jest.fn((_text: string) => button);
	button.onClick = jest.fn((callback: () => void) => {
		button.click = callback;
		return button;
	});
	return button;
}

describe("SmartExplorerSettingTab", () => {
	it("exposes every setting to Obsidian's declarative settings search", () => {
		const tab = new SmartExplorerSettingTab({} as any, {
			settings: {
				defaultSort: "name-asc",
				defaultGroup: "none",
				lastViewMode: "tree",
				hiddenExtensions: [],
				manualOrder: [],
			},
			saveSettings: jest.fn(),
		} as any);

		const definitions = tab.getSettingDefinitions();

		expect(definitions.filter((definition) => "name" in definition).map((definition) => definition.name)).toEqual([
			"Default sort mode",
			"Default group mode",
			"Hidden extensions",
			"Reset manual order",
		]);
		expect(definitions[0]).toMatchObject({
			control: {
				type: "dropdown",
				key: "defaultSort",
			},
		});
		expect(definitions[1]).toMatchObject({
			control: {
				type: "dropdown",
				key: "defaultGroup",
			},
		});
		expect(definitions[2]).toMatchObject({ render: expect.any(Function) });
		expect(definitions[3]).toMatchObject({ render: expect.any(Function) });
		expect(definitions[0]).toMatchObject({ desc: "Used when a new Smart Explorer view opens." });
		expect(definitions[1]).toMatchObject({ desc: "Used when a new Smart Explorer view opens." });
	});

	it("refreshes open views only after hidden extensions save successfully", async () => {
		jest.useFakeTimers();
		const onChange = jest.fn();
		let finishSave!: () => void;
		const plugin = {
			settings: { hiddenExtensions: [], manualOrder: [] },
			saveSettingsWithNotice: jest.fn(() => new Promise<boolean>((resolve) => { finishSave = () => resolve(true); })),
			refreshExplorerViews: jest.fn(),
			resetExplorerManualOrderViews: jest.fn(),
		};
		const tab = new SmartExplorerSettingTab({} as any, plugin as any);
		const setting = { addText: (build: any) => build({
			setPlaceholder() { return this; },
			setValue() { return this; },
			onChange(callback: (value: string) => void) { onChange.mockImplementation(callback); return this; },
		}) };
		(tab as any).addHiddenExtensionsControl(setting);

		onChange(".PNG, css");
		jest.advanceTimersByTime(500);
		expect(plugin.refreshExplorerViews).not.toHaveBeenCalled();
		finishSave();
		await Promise.resolve();
		await Promise.resolve();

		expect(plugin.saveSettingsWithNotice).toHaveBeenCalledTimes(1);
		expect(plugin.refreshExplorerViews).toHaveBeenCalledTimes(1);
		expect(plugin.resetExplorerManualOrderViews).not.toHaveBeenCalled();
		jest.useRealTimers();
	});

	it("does not refresh hidden-extension projections when saving fails", async () => {
		jest.useFakeTimers();
		const onChange = jest.fn();
		const plugin = {
			settings: { hiddenExtensions: [], manualOrder: [] },
			saveSettingsWithNotice: jest.fn().mockResolvedValue(false),
			refreshExplorerViews: jest.fn(),
			resetExplorerManualOrderViews: jest.fn(),
		};
		const tab = new SmartExplorerSettingTab({} as any, plugin as any);
		const setting = { addText: (build: any) => build({
			setPlaceholder() { return this; },
			setValue() { return this; },
			onChange(callback: (value: string) => void) { onChange.mockImplementation(callback); return this; },
		}) };
		(tab as any).addHiddenExtensionsControl(setting);

		onChange("pdf");
		jest.advanceTimersByTime(500);
		await Promise.resolve();
		await Promise.resolve();

		expect(plugin.refreshExplorerViews).not.toHaveBeenCalled();
		expect(plugin.resetExplorerManualOrderViews).not.toHaveBeenCalled();
		jest.useRealTimers();
	});

	it("does not refresh or show reset success when saving fails", async () => {
		const plugin = {
			settings: { hiddenExtensions: [], manualOrder: ["a"] },
			saveSettingsWithNotice: jest.fn().mockResolvedValue(false),
			refreshExplorerViews: jest.fn(),
			resetExplorerManualOrderViews: jest.fn(),
		};
		const button = makeButton();
		const tab = new SmartExplorerSettingTab({} as any, plugin as any);
		(tab as any).addResetManualOrderControl({ addButton: (build: any) => build(button) });

		button.click?.();
		await Promise.resolve();
		await Promise.resolve();

		expect(plugin.refreshExplorerViews).not.toHaveBeenCalled();
		expect(plugin.resetExplorerManualOrderViews).not.toHaveBeenCalled();
		expect(button.setButtonText).not.toHaveBeenCalledWith("Done!");
	});

	it("refreshes open views after manual order reset is saved", async () => {
		jest.useFakeTimers();
		let finishSave!: () => void;
		const plugin = {
			settings: { hiddenExtensions: [], manualOrder: ["a"] },
			saveSettingsWithNotice: jest.fn(() => new Promise<boolean>((resolve) => { finishSave = () => resolve(true); })),
			refreshExplorerViews: jest.fn(),
			resetExplorerManualOrderViews: jest.fn(),
		};
		const button = makeButton();
		const tab = new SmartExplorerSettingTab({} as any, plugin as any);
		(tab as any).addResetManualOrderControl({ addButton: (build: any) => build(button) });

		button.click?.();
		expect(plugin.resetExplorerManualOrderViews).not.toHaveBeenCalled();
		finishSave();
		await Promise.resolve();
		await Promise.resolve();

		expect(plugin.saveSettingsWithNotice).toHaveBeenCalledTimes(1);
		expect(plugin.resetExplorerManualOrderViews).toHaveBeenCalledTimes(1);
		expect(plugin.refreshExplorerViews).not.toHaveBeenCalled();
		expect(button.setButtonText).toHaveBeenCalledWith("Done!");
		jest.useRealTimers();
	});

	it("still saves a later change after a failed hidden-extension save", async () => {
		jest.useFakeTimers();
		const onChange = jest.fn();
		const plugin = {
			settings: { hiddenExtensions: [], manualOrder: [] },
			saveSettingsWithNotice: jest.fn()
				.mockResolvedValueOnce(false)
				.mockResolvedValueOnce(true),
			refreshExplorerViews: jest.fn(),
			resetExplorerManualOrderViews: jest.fn(),
		};
		const tab = new SmartExplorerSettingTab({} as any, plugin as any);
		const setting = { addText: (build: any) => build({
			setPlaceholder() { return this; },
			setValue() { return this; },
			onChange(callback: (value: string) => void) { onChange.mockImplementation(callback); return this; },
		}) };
		(tab as any).addHiddenExtensionsControl(setting);

		onChange("pdf");
		jest.advanceTimersByTime(500);
		await Promise.resolve();
		await Promise.resolve();
		onChange("png");
		jest.advanceTimersByTime(500);
		await Promise.resolve();
		await Promise.resolve();

		expect(plugin.saveSettingsWithNotice).toHaveBeenCalledTimes(2);
		expect(plugin.refreshExplorerViews).toHaveBeenCalledTimes(1);
		jest.useRealTimers();
	});
});
