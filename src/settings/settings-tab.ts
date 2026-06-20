import { App, PluginSettingTab, Setting } from "obsidian";
import type SmartExplorerPlugin from "../main";
import { SORT_OPTIONS, GROUP_OPTIONS } from "./settings-helpers";
import type { SortMode, GroupMode } from "../types";

export class SmartExplorerSettingTab extends PluginSettingTab {
	plugin: SmartExplorerPlugin;

	constructor(app: App, plugin: SmartExplorerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Default sort mode")
			.setDesc("How files are sorted when the explorer opens.")
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
			.setDesc("How files are grouped when the explorer opens.")
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

		new Setting(containerEl)
			.setName("Hidden extensions")
			.setDesc("Comma-separated list of file extensions to hide (e.g. JSON, CSS).")
			.addText((text) => {
				let debounceTimer: number | null = null;
				text
					.setPlaceholder("JSON, CSS, txt")
					.setValue(this.plugin.settings.hiddenExtensions.join(", "))
					.onChange((v) => {
						if (debounceTimer) window.clearTimeout(debounceTimer);
						debounceTimer = window.setTimeout(() => {
							this.plugin.settings.hiddenExtensions = v
								.split(",")
								.map((s) => s.trim().toLowerCase())
								.filter((s) => s.length > 0);
							void this.plugin.saveSettings();
						}, 500);
					});
			});

		new Setting(containerEl)
			.setName("Reset manual order")
			.setDesc("Clear the saved drag-and-drop file order. Files will be re-ordered based on the current sort when you next select manual sort.")
			.addButton((btn) => {
				btn.setButtonText("Reset").onClick(() => {
					this.plugin.settings.manualOrder = [];
					void this.plugin.saveSettings().then(() => {
						btn.setButtonText("Done!");
						window.setTimeout(() => { btn.setButtonText("Reset"); }, 1500);
					});
				});
			});
	}
}
