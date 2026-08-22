import { App, PluginSettingTab, Setting } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import type SmartExplorerPlugin from "../main";
import { SORT_OPTIONS, GROUP_OPTIONS } from "./settings-helpers";
import type { SortMode, GroupMode } from "../types";
import { normalizeSettings } from "./settings-normalization";

const NEW_VIEW_DEFAULT_DESCRIPTION = "Used when a new Smart Explorer view opens.";

export class SmartExplorerSettingTab extends PluginSettingTab {
	plugin: SmartExplorerPlugin;

	constructor(app: App, plugin: SmartExplorerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: "Default sort mode",
				desc: NEW_VIEW_DEFAULT_DESCRIPTION,
				control: {
					type: "dropdown",
					key: "defaultSort",
					defaultValue: "name-asc",
					options: Object.fromEntries(SORT_OPTIONS.map((option) => [option.value, option.text])),
				},
			},
			{
				name: "Default group mode",
				desc: NEW_VIEW_DEFAULT_DESCRIPTION,
				control: {
					type: "dropdown",
					key: "defaultGroup",
					defaultValue: "none",
					options: Object.fromEntries(GROUP_OPTIONS.map((option) => [option.value, option.text])),
				},
			},
			{
				name: "Hidden extensions",
				desc: "Comma-separated list of file extensions to hide (e.g. JSON, CSS).",
				render: (setting) => this.addHiddenExtensionsControl(setting),
			},
			{
				name: "Reset manual order",
				desc: "Clear the saved drag-and-drop file order. Files will be re-ordered based on the current sort when you next select manual sort.",
				render: (setting) => this.addResetManualOrderControl(setting),
			},
		];
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Default sort mode")
			.setDesc(NEW_VIEW_DEFAULT_DESCRIPTION)
			.addDropdown((dd) => {
				for (const opt of SORT_OPTIONS) {
					dd.addOption(opt.value, opt.text);
				}
				dd.setValue(this.plugin.settings.defaultSort)
					.onChange(async (v) => {
						this.plugin.settings.defaultSort = v as SortMode;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Default group mode")
			.setDesc(NEW_VIEW_DEFAULT_DESCRIPTION)
			.addDropdown((dd) => {
				for (const opt of GROUP_OPTIONS) {
					dd.addOption(opt.value, opt.text);
				}
				dd.setValue(this.plugin.settings.defaultGroup)
					.onChange(async (v) => {
						this.plugin.settings.defaultGroup = v as GroupMode;
						await this.plugin.saveSettings();
					});
			});

		const hiddenExtensionsSetting = new Setting(containerEl)
			.setName("Hidden extensions")
			.setDesc("Comma-separated list of file extensions to hide (e.g. JSON, CSS).");
		this.addHiddenExtensionsControl(hiddenExtensionsSetting);

		const resetManualOrderSetting = new Setting(containerEl)
			.setName("Reset manual order")
			.setDesc("Clear the saved drag-and-drop file order. Files will be re-ordered based on the current sort when you next select manual sort.");
		this.addResetManualOrderControl(resetManualOrderSetting);
	}

	private addHiddenExtensionsControl(setting: Setting): void {
		setting.addText((text) => {
			let debounceTimer: number | null = null;
			text
				.setPlaceholder("JSON, CSS, txt")
				.setValue(this.plugin.settings.hiddenExtensions.join(", "))
				.onChange((v) => {
					if (debounceTimer) window.clearTimeout(debounceTimer);
					debounceTimer = window.setTimeout(() => {
						this.plugin.settings.hiddenExtensions = normalizeSettings({
							...this.plugin.settings,
							hiddenExtensions: v.split(","),
						}).hiddenExtensions;
						void this.plugin.saveSettings()
							.then(() => this.plugin.refreshExplorerViews())
							.catch(() => {});
					}, 500);
				});
		});
	}

	private addResetManualOrderControl(setting: Setting): void {
		setting.addButton((btn) => {
			btn.setButtonText("Reset").onClick(() => {
				this.plugin.settings.manualOrder = [];
				void this.plugin.saveSettings().then(() => {
					this.plugin.resetExplorerManualOrderViews();
					btn.setButtonText("Done!");
					window.setTimeout(() => { btn.setButtonText("Reset"); }, 1500);
				}).catch(() => {});
			});
		});
	}
}
