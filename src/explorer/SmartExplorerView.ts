import { ItemView, WorkspaceLeaf } from "obsidian";
import { SMART_EXPLORER_VIEW_TYPE } from "../constants";
import { FileIndex } from "./FileIndex";
import { buildSections } from "./FileTreeModel";
import type { ExplorerQuery, ExplorerSection, FileRecord, SortMode, GroupMode } from "../types";

export class SmartExplorerView extends ItemView {
	private fileIndex: FileIndex;
	private query: ExplorerQuery;
	private listContainer: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.fileIndex = new FileIndex(this.app);
		this.query = {
			searchText: "",
			sort: "name-asc",
			group: "none",
			extension: null,
			markdownOnly: false,
			attachmentsOnly: false,
			modifiedWithinDays: null,
		};
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

		this.renderToolbar(container);
		this.listContainer = container.createDiv({ cls: "smart-explorer-list" });

		this.fileIndex.build();
		this.renderList();
	}

	async onClose() {
		this.listContainer = null;
	}

	private renderToolbar(container: HTMLElement) {
		const toolbar = container.createDiv({ cls: "smart-explorer-toolbar" });

		const searchInput = toolbar.createEl("input", {
			type: "text",
			placeholder: "Search files...",
			cls: "smart-explorer-search",
		});
		searchInput.addEventListener("input", () => {
			this.query.searchText = searchInput.value;
			this.renderList();
		});

		const sortSelect = toolbar.createEl("select", { cls: "smart-explorer-sort" });
		const sortOptions: { value: SortMode; text: string }[] = [
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
		sortSelect.addEventListener("change", () => {
			this.query.sort = sortSelect.value as SortMode;
			this.renderList();
		});

		const groupSelect = toolbar.createEl("select", { cls: "smart-explorer-group" });
		const groupOptions: { value: GroupMode; text: string }[] = [
			{ value: "none", text: "No grouping" },
			{ value: "folder", text: "By folder" },
			{ value: "extension", text: "By extension" },
			{ value: "modified-month", text: "By modified month" },
			{ value: "top-folder", text: "By top-level folder" },
		];
		for (const opt of groupOptions) {
			groupSelect.createEl("option", { value: opt.value, text: opt.text });
		}
		groupSelect.addEventListener("change", () => {
			this.query.group = groupSelect.value as GroupMode;
			this.renderList();
		});
	}

	private renderList() {
		if (!this.listContainer) return;
		this.listContainer.empty();

		const records = this.fileIndex.getAll();
		if (records.length === 0) {
			this.listContainer.createDiv({
				cls: "smart-explorer-empty",
				text: "No files in vault.",
			});
			return;
		}

		const sections = buildSections(records, this.query);

		if (sections.length === 0 || sections.every((s) => s.records.length === 0)) {
			this.listContainer.createDiv({
				cls: "smart-explorer-empty",
				text: "No files match your filters.",
			});
			return;
		}

		for (const section of sections) {
			if (section.records.length === 0) continue;
			if (this.query.group !== "none") {
				const header = this.listContainer.createDiv({ cls: "smart-explorer-section-header" });
				header.setText(`${section.title} (${section.records.length})`);
			}
			for (const record of section.records) {
				this.renderRow(record);
			}
		}
	}

	private renderRow(record: FileRecord) {
		if (!this.listContainer) return;
		const row = this.listContainer.createDiv({ cls: "smart-explorer-row" });
		row.createSpan({ cls: "smart-explorer-row-name", text: record.basename });
		row.createSpan({ cls: "smart-explorer-row-ext", text: `.${record.extension}` });
		row.addEventListener("click", () => {
			this.openFile(record.path);
		});
	}

	private async openFile(path: string) {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file) {
			await this.app.workspace.getLeaf(false).openFile(file as any);
		}
	}
}
