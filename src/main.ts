import { Plugin } from "obsidian";
import { SMART_EXPLORER_VIEW_TYPE } from "./constants";

export default class SmartExplorerPlugin extends Plugin {
	async onload() {
		this.addRibbonIcon("search", "Smart Explorer", () => {
			this.activateView();
		});

		this.addCommand({
			id: "open-smart-explorer",
			name: "Open",
			callback: () => this.activateView(),
		});
	}

	onunload() {}

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
