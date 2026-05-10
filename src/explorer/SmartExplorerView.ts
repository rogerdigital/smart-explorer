import { ItemView, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { SMART_EXPLORER_VIEW_TYPE } from "../constants";
import { FileIndex } from "./FileIndex";
import { buildSections } from "./FileTreeModel";
import { getPreviewData, formatFileSize, formatDate } from "./preview";
import type { PreviewData } from "./preview";
import type { ExplorerQuery, FileRecord, SortMode, GroupMode } from "../types";
import type { SmartExplorerSettings } from "../settings/settings";
import { SORT_OPTIONS, GROUP_OPTIONS } from "../settings/settings-helpers";

const MODIFIED_RANGE_OPTIONS: { value: string; text: string; days: number | null }[] = [
	{ value: "all", text: "Any time", days: null },
	{ value: "1d", text: "Last day", days: 1 },
	{ value: "7d", text: "Last 7 days", days: 7 },
	{ value: "30d", text: "Last 30 days", days: 30 },
];

export class SmartExplorerView extends ItemView {
	private plugin: Plugin;
	private fileIndex: FileIndex;
	private query: ExplorerQuery;
	private listContainer: HTMLElement | null = null;
	private previewPanel: HTMLElement | null = null;
	private selectedPath: string | null = null;
	private previewEnabled = true;
	private searchTimeout: ReturnType<typeof setTimeout> | null = null;
	private rebuildTimeout: ReturnType<typeof setTimeout> | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: Plugin) {
		super(leaf);
		this.plugin = plugin;
		this.fileIndex = new FileIndex(this.app);
		const settings = (plugin as any).settings as SmartExplorerSettings;
		this.previewEnabled = settings?.previewEnabled ?? true;
		this.query = {
			searchText: "",
			sort: settings?.defaultSort ?? "name-asc",
			group: settings?.defaultGroup ?? "none",
			extension: null,
			markdownOnly: settings?.markdownOnly ?? false,
			attachmentsOnly: settings?.attachmentsOnly ?? false,
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

		const body = container.createDiv({ cls: "smart-explorer-body" });
		this.listContainer = body.createDiv({ cls: "smart-explorer-list" });
		this.previewPanel = body.createDiv({ cls: "smart-explorer-preview" });

		this.fileIndex.build();
		this.renderList();
		this.renderPreview();

		this.registerVaultEvents();
	}

	async onClose() {
		this.listContainer = null;
		this.previewPanel = null;
		if (this.searchTimeout) clearTimeout(this.searchTimeout);
		if (this.rebuildTimeout) clearTimeout(this.rebuildTimeout);
	}

	private registerVaultEvents() {
		const events = this.plugin.app.vault;

		this.registerEvent(events.on("create", (file) => {
			if (file instanceof TFile) {
				this.fileIndex.addFile(file);
				this.scheduleRebuild();
			}
		}));

		this.registerEvent(events.on("delete", (file) => {
			if (file instanceof TFile) {
				this.fileIndex.removeFile(file.path);
				if (this.selectedPath === file.path) {
					this.selectedPath = null;
				}
				this.scheduleRebuild();
			}
		}));

		this.registerEvent(events.on("rename", (file, oldPath) => {
			if (file instanceof TFile) {
				this.fileIndex.removeFile(oldPath);
				this.fileIndex.addFile(file);
				if (this.selectedPath === oldPath) {
					this.selectedPath = file.path;
				}
				this.scheduleRebuild();
			}
		}));

		this.registerEvent(events.on("modify", (file) => {
			if (file instanceof TFile) {
				this.fileIndex.addFile(file);
				this.scheduleRebuild();
			}
		}));
	}

	private scheduleRebuild() {
		if (this.rebuildTimeout) clearTimeout(this.rebuildTimeout);
		this.rebuildTimeout = setTimeout(() => {
			this.renderList();
			this.renderPreview();
		}, 300);
	}

	private renderToolbar(container: HTMLElement) {
		const toolbar = container.createDiv({ cls: "smart-explorer-toolbar" });

		const searchInput = toolbar.createEl("input", {
			type: "text",
			placeholder: "Search files...",
			cls: "smart-explorer-search",
		});
		searchInput.addEventListener("input", () => {
			if (this.searchTimeout) clearTimeout(this.searchTimeout);
			this.searchTimeout = setTimeout(() => {
				this.query.searchText = searchInput.value;
				this.renderList();
			}, 200);
		});

		const row1 = toolbar.createDiv({ cls: "smart-explorer-toolbar-row" });
		this.createSelect(row1, SORT_OPTIONS, "smart-explorer-sort", (v) => { this.query.sort = v as SortMode; this.renderList(); });
		this.createSelect(row1, GROUP_OPTIONS, "smart-explorer-group", (v) => { this.query.group = v as GroupMode; this.renderList(); });

		const row2 = toolbar.createDiv({ cls: "smart-explorer-toolbar-row" });

		this.createSelect(
			row2,
			MODIFIED_RANGE_OPTIONS.map((o) => ({ value: o.value, text: o.text })),
			"smart-explorer-modified",
			(v) => {
				const opt = MODIFIED_RANGE_OPTIONS.find((o) => o.value === v);
				this.query.modifiedWithinDays = opt?.days ?? null;
				this.renderList();
			},
		);

		this.createToggle(row2, "MD", "smart-explorer-toggle-md", () => {
			this.query.markdownOnly = !this.query.markdownOnly;
			if (this.query.markdownOnly) this.query.attachmentsOnly = false;
			this.updateToggleStates(row2);
			this.renderList();
		});

		this.createToggle(row2, "Files", "smart-explorer-toggle-attach", () => {
			this.query.attachmentsOnly = !this.query.attachmentsOnly;
			if (this.query.attachmentsOnly) this.query.markdownOnly = false;
			this.updateToggleStates(row2);
			this.renderList();
		});

		const previewBtn = this.createToggle(row2, "Preview", "smart-explorer-toggle-preview", () => {
			this.previewEnabled = !this.previewEnabled;
			previewBtn.classList.toggle("is-active", this.previewEnabled);
			if (this.previewPanel) {
				this.previewPanel.classList.toggle("is-hidden", !this.previewEnabled);
			}
			this.renderPreview();
		});
		previewBtn.classList.add("is-active");

		this.updateToggleStates(row2);
	}

	private createSelect(
		parent: HTMLElement,
		options: { value: string; text: string }[],
		cls: string,
		onChange: (value: string) => void,
	) {
		const select = parent.createEl("select", { cls });
		for (const opt of options) {
			select.createEl("option", { value: opt.value, text: opt.text });
		}
		select.addEventListener("change", () => onChange(select.value));
		return select;
	}

	private createToggle(
		parent: HTMLElement,
		label: string,
		cls: string,
		onClick: () => void,
	) {
		const btn = parent.createEl("button", { cls, text: label });
		btn.addEventListener("click", onClick);
		return btn;
	}

	private updateToggleStates(row: HTMLElement) {
		const mdBtn = row.querySelector(".smart-explorer-toggle-md") as HTMLElement | null;
		const attachBtn = row.querySelector(".smart-explorer-toggle-attach") as HTMLElement | null;
		if (mdBtn) mdBtn.classList.toggle("is-active", this.query.markdownOnly);
		if (attachBtn) attachBtn.classList.toggle("is-active", this.query.attachmentsOnly);
	}

	private renderList() {
		if (!this.listContainer) return;
		this.listContainer.empty();

		const settings = (this.plugin as any).settings as SmartExplorerSettings | undefined;
		const hiddenExts = new Set(settings?.hiddenExtensions ?? []);

		let records = this.fileIndex.getAll();
		if (hiddenExts.size > 0) {
			records = records.filter((r) => !hiddenExts.has(r.extension));
		}

		if (records.length === 0) {
			this.listContainer.createDiv({
				cls: "smart-explorer-empty",
				text: "No files in vault.",
			});
			return;
		}

		const sections = buildSections(records, this.query);

		if (sections.length === 0 || sections.every((s) => s.records.length === 0)) {
			const empty = this.listContainer.createDiv({ cls: "smart-explorer-empty" });
			empty.createSpan({ text: "No files match your filters." });
			const clearBtn = empty.createEl("button", { text: "Clear filters", cls: "smart-explorer-clear-btn" });
			clearBtn.addEventListener("click", () => {
				this.query = {
					searchText: "",
					sort: "name-asc",
					group: "none",
					extension: null,
					markdownOnly: false,
					attachmentsOnly: false,
					modifiedWithinDays: null,
				};
				const container = this.containerEl.children[1] as HTMLElement;
				container.empty();
				container.classList.add("smart-explorer");
				this.renderToolbar(container);
				const body = container.createDiv({ cls: "smart-explorer-body" });
				this.listContainer = body.createDiv({ cls: "smart-explorer-list" });
				this.previewPanel = body.createDiv({ cls: "smart-explorer-preview" });
				this.renderList();
				this.renderPreview();
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
		if (record.path === this.selectedPath) {
			row.classList.add("is-selected");
		}
		row.createSpan({ cls: "smart-explorer-row-name", text: record.basename });
		row.createSpan({ cls: "smart-explorer-row-ext", text: `.${record.extension}` });
		row.addEventListener("click", () => {
			this.selectedPath = record.path;
			this.openFile(record.path);
			this.highlightSelected();
			this.renderPreview();
		});
	}

	private highlightSelected() {
		if (!this.listContainer) return;
		const rows = this.listContainer.querySelectorAll(".smart-explorer-row");
		rows.forEach((el) => {
			const rowEl = el as HTMLElement;
			rowEl.classList.toggle("is-selected", rowEl.dataset.path === this.selectedPath);
		});
	}

	private renderPreview() {
		if (!this.previewPanel) return;
		this.previewPanel.empty();

		if (!this.previewEnabled) {
			this.previewPanel.classList.add("is-hidden");
			return;
		}
		this.previewPanel.classList.remove("is-hidden");

		if (!this.selectedPath) {
			this.previewPanel.createDiv({
				cls: "smart-explorer-preview-empty",
				text: "Select a file to preview.",
			});
			return;
		}

		const record = this.fileIndex.get(this.selectedPath);
		if (!record) {
			this.previewPanel.createDiv({
				cls: "smart-explorer-preview-empty",
				text: "File not found.",
			});
			return;
		}

		const data = getPreviewData(record);
		this.renderPreviewContent(data, record);
	}

	private renderPreviewContent(data: PreviewData, record: FileRecord) {
		if (!this.previewPanel) return;

		const header = this.previewPanel.createDiv({ cls: "smart-explorer-preview-header" });
		header.createSpan({ cls: "smart-explorer-preview-title", text: record.basename });
		header.createSpan({ cls: "smart-explorer-preview-path", text: record.path });

		if (data.type === "markdown") {
			if (data.heading) {
				this.previewPanel.createDiv({
					cls: "smart-explorer-preview-heading",
					text: data.heading,
				});
			}
			if (data.tags.length > 0) {
				const tagsEl = this.previewPanel.createDiv({ cls: "smart-explorer-preview-tags" });
				for (const tag of data.tags) {
					tagsEl.createSpan({ cls: "smart-explorer-preview-tag", text: `#${tag}` });
				}
			}
		} else if (data.type === "image") {
			const imgContainer = this.previewPanel.createDiv({ cls: "smart-explorer-preview-image" });
			const img = imgContainer.createEl("img");
			const file = this.app.vault.getAbstractFileByPath(data.path);
			if (file) {
				img.src = this.app.vault.getResourcePath(file as any);
			}
			img.alt = record.basename;
		} else {
			const meta = this.previewPanel.createDiv({ cls: "smart-explorer-preview-meta" });
			meta.createDiv({ text: `Type: ${data.extension.toUpperCase()}` });
			meta.createDiv({ text: `Size: ${formatFileSize(data.size)}` });
			meta.createDiv({ text: `Modified: ${formatDate(data.mtime)}` });
		}
	}

	private async openFile(path: string) {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file) {
			await this.app.workspace.getLeaf(false).openFile(file as any);
		}
	}
}
