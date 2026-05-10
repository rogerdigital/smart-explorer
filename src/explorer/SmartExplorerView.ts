import { ItemView, WorkspaceLeaf } from "obsidian";
import { SMART_EXPLORER_VIEW_TYPE } from "../constants";

export class SmartExplorerView extends ItemView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return SMART_EXPLORER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Smart Explorer";
	}

	getIcon(): string {
		return "search";
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.classList.add("smart-explorer");

		const toolbar = container.createDiv({ cls: "smart-explorer-toolbar" });
		toolbar.createEl("input", {
			type: "text",
			placeholder: "Search files...",
			cls: "smart-explorer-search",
		});

		const sortSelect = toolbar.createEl("select", { cls: "smart-explorer-sort" });
		const sortOptions = [
			{ value: "name-asc", text: "Name A-Z" },
			{ value: "name-desc", text: "Name Z-A" },
			{ value: "modified-new", text: "Modified (newest)" },
			{ value: "modified-old", text: "Modified (oldest)" },
			{ value: "created-new", text: "Created (newest)" },
			{ value: "created-old", text: "Created (oldest)" },
			{ value: "extension", text: "Extension" },
			{ value: "size", text: "Size" },
		];
		for (const opt of sortOptions) {
			sortSelect.createEl("option", { value: opt.value, text: opt.text });
		}

		const groupSelect = toolbar.createEl("select", { cls: "smart-explorer-group" });
		const groupOptions = [
			{ value: "none", text: "No grouping" },
			{ value: "folder", text: "By folder" },
			{ value: "extension", text: "By extension" },
			{ value: "modified-month", text: "By modified month" },
			{ value: "top-folder", text: "By top-level folder" },
		];
		for (const opt of groupOptions) {
			groupSelect.createEl("option", { value: opt.value, text: opt.text });
		}

		const listContainer = container.createDiv({ cls: "smart-explorer-list" });
		listContainer.createDiv({
			cls: "smart-explorer-empty",
			text: "No files loaded yet.",
		});
	}

	async onClose() {
		// Cleanup handled by containerEl lifecycle
	}
}
