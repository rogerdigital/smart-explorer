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

		this.addRibbonIcon("compass", "Smart explorer", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open",
			name: "Open",
			callback: () => { void this.activateView(); },
		});

		this.addCommand({
			id: "focus-search",
			name: "Focus search",
			callback: () => { void this.runInExplorerView((view) => view.focusSearch()); },
		});

		this.addCommand({
			id: "reveal-active-file",
			name: "Reveal active file",
			callback: () => { void this.runInExplorerView((view) => view.revealActiveFile()); },
		});

		this.addCommand({
			id: "new-note",
			name: "New note",
			callback: () => { void this.runInExplorerView((view) => view.startCreateNote()); },
		});

		this.addCommand({
			id: "new-folder",
			name: "New folder",
			callback: () => { void this.runInExplorerView((view) => view.startCreateFolder()); },
		});

		this.addSettingTab(new SmartExplorerSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		const saved = await this.loadData() as Partial<SmartExplorerSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView(): Promise<SmartExplorerView | null> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(SMART_EXPLORER_VIEW_TYPE)[0];
		if (!leaf) {
			const leftLeaf = workspace.getLeftLeaf(false);
			if (!leftLeaf) return null;
			leaf = leftLeaf;
			await leaf.setViewState({
				type: SMART_EXPLORER_VIEW_TYPE,
				active: true,
			});
		}
		await workspace.revealLeaf(leaf);
		return leaf.view instanceof SmartExplorerView ? leaf.view : null;
	}

	private async runInExplorerView(action: (view: SmartExplorerView) => void) {
		const view = await this.activateView();
		if (!view) return;
		action(view);
	}
}
