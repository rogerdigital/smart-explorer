import { Plugin } from "obsidian";
import { SMART_EXPLORER_VIEW_TYPE } from "./constants";
import { SmartExplorerView } from "./explorer/SmartExplorerView";
import { DEFAULT_SETTINGS } from "./settings/settings";
import { SmartExplorerSettingTab } from "./settings/settings-tab";
import type { SmartExplorerSettings } from "./settings/settings";

export default class SmartExplorerPlugin extends Plugin {
	settings!: SmartExplorerSettings;

	async onload() {
		await this.loadSettings();

		this.registerView(SMART_EXPLORER_VIEW_TYPE, (leaf) => new SmartExplorerView(leaf, this));

		this.addRibbonIcon("search", "Smart Explorer", () => {
			this.activateView();
		});

		this.addCommand({
			id: "open-smart-explorer",
			name: "Open",
			callback: () => this.activateView(),
		});

		this.addSettingTab(new SmartExplorerSettingTab(this.app, this));
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(SMART_EXPLORER_VIEW_TYPE);
	}

	async loadSettings() {
		const saved = await this.loadData() as Partial<SmartExplorerSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(SMART_EXPLORER_VIEW_TYPE)[0];
		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (!rightLeaf) return;
			leaf = rightLeaf;
			await leaf.setViewState({
				type: SMART_EXPLORER_VIEW_TYPE,
				active: true,
			});
		}
		workspace.revealLeaf(leaf);
	}
}
