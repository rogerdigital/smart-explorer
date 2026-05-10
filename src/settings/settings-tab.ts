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

		containerEl.createEl("h2", { text: "Smart Explorer" });

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
			.setName("Preview enabled")
			.setDesc("Show the file preview panel by default.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.previewEnabled)
					.onChange(async (v) => {
						this.plugin.settings.previewEnabled = v;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Hidden extensions")
			.setDesc("Comma-separated list of file extensions to hide (e.g. json, css).")
			.addText((text) => {
				text
					.setPlaceholder("json, css, txt")
					.setValue(this.plugin.settings.hiddenExtensions.join(", "))
					.onChange(async (v) => {
						this.plugin.settings.hiddenExtensions = v
							.split(",")
							.map((s) => s.trim().toLowerCase())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					});
			});
	}
}
