jest.mock(
	"obsidian",
	() => ({
		PluginSettingTab: class {},
		Setting: class {},
	}),
	{ virtual: true },
);

import { SmartExplorerSettingTab } from "../settings-tab";

describe("SmartExplorerSettingTab", () => {
	it("exposes every setting to Obsidian's declarative settings search", () => {
		const tab = new SmartExplorerSettingTab({} as any, {
			settings: {
				defaultSort: "name-asc",
				defaultGroup: "none",
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
	});
});
