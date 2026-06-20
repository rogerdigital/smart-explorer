import { ItemView, Menu, Platform, TFile, WorkspaceLeaf } from "obsidian";
import { SMART_EXPLORER_VIEW_TYPE } from "../constants";
import { FileIndex } from "./FileIndex";
import { VirtualList } from "./VirtualList";
import { DragSortManager } from "./DragSortManager";
import { buildSections } from "./FileTreeModel";
import { buildTree } from "./TreeModel";
import type { ExplorerTreeNode } from "./TreeModel";
import { reorderManualOrder } from "./manualOrder";
import { cloneSavedViewQuery, getSavedViewOptions } from "./savedViews";
import { formatFileModifiedDate, formatFileParent } from "./fileRow";
import { resolveExplorerViewMode } from "./viewMode";
import type { ExplorerQuery, FileRecord, SortMode, GroupMode, ViewMode } from "../types";

import type SmartExplorerPlugin from "../main";
import { SORT_OPTIONS, GROUP_OPTIONS } from "../settings/settings-helpers";

const MODIFIED_RANGE_OPTIONS: { value: string; text: string; days: number | null }[] = [
	{ value: "all", text: "Any time", days: null },
	{ value: "1d", text: "Last day", days: 1 },
	{ value: "7d", text: "Last 7 days", days: 7 },
	{ value: "30d", text: "Last 30 days", days: 30 },
];

export class SmartExplorerView extends ItemView {
	private plugin: SmartExplorerPlugin;
	private fileIndex: FileIndex;
	private query: ExplorerQuery;
	private viewMode: ViewMode = "tree";
	private activeSavedViewId: string | null = null;
	private listContainer: HTMLElement | null = null;
	private viewModeBtn: HTMLButtonElement | null = null;
	private extSelect: HTMLSelectElement | null = null;
	private fileCountEl: HTMLElement | null = null;
	private searchInput: HTMLInputElement | null = null;
	private filterRow: HTMLElement | null = null;
	private manualEditBtn: HTMLButtonElement | null = null;
	private manualUndoBtn: HTMLButtonElement | null = null;
	private selectedPath: string | null = null;
	private virtualList: VirtualList | null = null;
	private searchTimeout: number | null = null;
	private rebuildTimeout: number | null = null;
	private dragSortManager: DragSortManager | null = null;
	private manualOrderIndex: Map<string, number> = new Map();
	private manualOrderEditing = false;
	private manualOrderUndoStack: string[][] = [];
	private saveOrderTimeout: number | null = null;
	private tooltipEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: SmartExplorerPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.fileIndex = new FileIndex(this.app);
		const settings = this.plugin.settings;
		this.query = {
			searchText: "",
			sort: settings.defaultSort,
			group: settings.defaultGroup,
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
		return "Smart explorer";
	}

	getIcon(): string {
		return "compass";
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.classList.add("smart-explorer");

		this.renderShell(container);
		this.showIndexing();
		await new Promise((r) => window.setTimeout(r, 0));
		this.fileIndex.build();
		this.renderList();

		this.registerVaultEvents();
	}

	private renderShell(container: HTMLElement) {
		container.empty();
		container.classList.add("smart-explorer");
		this.renderToolbar(container);

		const body = container.createDiv({ cls: "smart-explorer-body" });
		this.listContainer = body.createDiv({ cls: "smart-explorer-list" });
	}

	private showIndexing() {
		if (!this.listContainer) return;
		this.listContainer.empty();
		const el = this.listContainer.createDiv({ cls: "smart-explorer-indexing" });
		el.createSpan({ text: "Indexing files..." });
	}

	async onClose() {
		this.hideTooltip();
		if (this.virtualList) {
			this.virtualList.destroy();
			this.virtualList = null;
		}
		if (this.dragSortManager) {
			this.dragSortManager.destroy();
			this.dragSortManager = null;
		}
		this.listContainer = null;
		this.viewModeBtn = null;
		this.searchInput = null;
		this.filterRow = null;
		this.manualEditBtn = null;
		this.manualUndoBtn = null;
		if (this.searchTimeout) window.clearTimeout(this.searchTimeout);
		if (this.rebuildTimeout) window.clearTimeout(this.rebuildTimeout);
		if (this.saveOrderTimeout) window.clearTimeout(this.saveOrderTimeout);
	}

	private registerVaultEvents() {
		const events = this.plugin.app.vault;

		this.registerEvent(events.on("create", (file) => {
			if (file instanceof TFile) {
				this.fileIndex.addFile(file);
				const order = this.plugin.settings.manualOrder;
				if (order.length > 0 && !order.includes(file.path)) {
					order.push(file.path);
					this.buildManualOrderIndex();
				}
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
				const order = this.plugin.settings.manualOrder;
				const idx = order.indexOf(oldPath);
				if (idx >= 0) {
					order[idx] = file.path;
					this.buildManualOrderIndex();
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
		if (this.rebuildTimeout) window.clearTimeout(this.rebuildTimeout);
		this.rebuildTimeout = window.setTimeout(() => {
			if (this.extSelect) this.populateExtensions(this.extSelect);
			this.renderList();
		}, 300);
	}

	private renderToolbar(container: HTMLElement) {
		const toolbar = container.createDiv({ cls: "smart-explorer-toolbar" });

		const searchInput = toolbar.createEl("input", {
			type: "text",
			placeholder: "Search files...",
			cls: "smart-explorer-search",
		});
		this.searchInput = searchInput;
		searchInput.value = this.query.searchText;
		searchInput.addEventListener("input", () => {
			if (this.searchTimeout) window.clearTimeout(this.searchTimeout);
			this.searchTimeout = window.setTimeout(() => {
				this.query.searchText = searchInput.value;
				this.activeSavedViewId = null;
				this.renderList();
			}, 200);
		});

		const presetRow = toolbar.createDiv({ cls: "smart-explorer-toolbar-row smart-explorer-preset-row" });
		this.renderSavedViewControls(presetRow);

		const row1 = toolbar.createDiv({ cls: "smart-explorer-toolbar-row" });
		this.viewModeBtn = row1.createEl("button", {
			cls: "smart-explorer-view-mode",
			text: this.resolvedViewMode() === "tree" ? "Tree" : "List",
		});
		this.viewModeBtn.addEventListener("mouseenter", (e) => this.showTooltip("Toggle tree/list view", e));
		this.viewModeBtn.addEventListener("mouseleave", () => this.hideTooltip());
		this.viewModeBtn.addEventListener("click", () => {
			this.viewMode = this.viewMode === "tree" ? "list" : "tree";
			this.renderList();
		});
		this.createSelect(row1, SORT_OPTIONS, "smart-explorer-sort", (v) => {
			this.query.sort = v as SortMode;
			this.activeSavedViewId = null;
			if (this.query.sort !== "manual") {
				this.manualOrderEditing = false;
			}
			this.updateManualOrderControls();
			this.updateViewModeControl();
			this.renderList();
		}, this.query.sort);
		this.createSelect(row1, GROUP_OPTIONS, "smart-explorer-group", (v) => {
			this.query.group = v as GroupMode;
			this.activeSavedViewId = null;
			this.renderList();
		}, this.query.group);
		const row2 = toolbar.createDiv({ cls: "smart-explorer-toolbar-row smart-explorer-toolbar-filters" });
		this.filterRow = row2;
		row2.classList.add("is-collapsed");

		const filterToggleBtn = row1.createEl("button", {
			cls: "smart-explorer-filter-toggle",
			text: "Filters",
		});
		filterToggleBtn.addEventListener("mouseenter", (e) => this.showTooltip("Show filters", e));
		filterToggleBtn.addEventListener("mouseleave", () => this.hideTooltip());
		filterToggleBtn.addEventListener("click", () => {
			row2.classList.toggle("is-collapsed");
			filterToggleBtn.classList.toggle("is-active", !row2.classList.contains("is-collapsed"));
		});

		this.manualEditBtn = row1.createEl("button", {
			cls: "smart-explorer-manual-edit",
			text: "Edit order",
		});
		this.manualEditBtn.addEventListener("mouseenter", (e) => this.showTooltip("Enable manual drag sorting", e));
		this.manualEditBtn.addEventListener("mouseleave", () => this.hideTooltip());
		this.manualEditBtn.addEventListener("click", () => {
			if (this.query.sort !== "manual") return;
			this.manualOrderEditing = !this.manualOrderEditing;
			this.updateManualOrderControls();
			this.renderList();
		});

		this.manualUndoBtn = row1.createEl("button", {
			cls: "smart-explorer-manual-undo",
			text: "Undo",
		});
		this.manualUndoBtn.addEventListener("mouseenter", (e) => this.showTooltip("Undo last manual reorder", e));
		this.manualUndoBtn.addEventListener("mouseleave", () => this.hideTooltip());
		this.manualUndoBtn.addEventListener("click", () => this.undoManualReorder());

		const extOptions: { value: string; text: string }[] = [{ value: "", text: "All types" }];
		this.extSelect = this.createSelect(row2, extOptions, "smart-explorer-ext", (v) => {
			this.query.extension = v || null;
			this.activeSavedViewId = null;
			this.renderList();
		}, this.query.extension ?? "");
		this.populateExtensions(this.extSelect);

		this.createSelect(
			row2,
			MODIFIED_RANGE_OPTIONS.map((o) => ({ value: o.value, text: o.text })),
			"smart-explorer-modified",
			(v) => {
				const opt = MODIFIED_RANGE_OPTIONS.find((o) => o.value === v);
				this.query.modifiedWithinDays = opt?.days ?? null;
				this.activeSavedViewId = null;
				this.renderList();
			},
			this.modifiedRangeValue(),
		);

		this.createToggle(row2, "MD", "smart-explorer-toggle-md", () => {
			this.query.markdownOnly = !this.query.markdownOnly;
			this.activeSavedViewId = null;
			if (this.query.markdownOnly) this.query.attachmentsOnly = false;
			this.updateToggleStates(row2);
			this.renderList();
		}, "Markdown files only");

		this.createToggle(row2, "Files", "smart-explorer-toggle-attach", () => {
			this.query.attachmentsOnly = !this.query.attachmentsOnly;
			this.activeSavedViewId = null;
			if (this.query.attachmentsOnly) this.query.markdownOnly = false;
			this.updateToggleStates(row2);
			this.renderList();
		}, "Attachment files only");

		this.fileCountEl = toolbar.createDiv({ cls: "smart-explorer-file-count" });

		this.updateToggleStates(row2);
		this.updateViewModeControl();
		this.updateManualOrderControls();
		this.registerKeyboardShortcuts(container);
	}

	private createSelect(
		parent: HTMLElement,
		options: { value: string; text: string }[],
		cls: string,
		onChange: (value: string) => void,
		value?: string,
	) {
		const select = parent.createEl("select", { cls });
		for (const opt of options) {
			select.createEl("option", { value: opt.value, text: opt.text });
		}
		if (value !== undefined) select.value = value;
		select.addEventListener("change", () => onChange(select.value));
		return select;
	}

	private renderSavedViewControls(parent: HTMLElement) {
		const options = getSavedViewOptions(this.plugin.settings.savedViews);
		const select = parent.createEl("select", { cls: "smart-explorer-saved-view" });
		select.createEl("option", { value: "", text: "Custom view" });
		for (const view of options) {
			select.createEl("option", { value: view.id, text: view.name });
		}
		select.value = this.activeSavedViewId ?? "";
		select.addEventListener("change", () => {
			const selected = options.find((view) => view.id === select.value);
			if (!selected) {
				this.activeSavedViewId = null;
				return;
			}
			this.activeSavedViewId = selected.id;
			this.query = cloneSavedViewQuery(selected.query);
			this.manualOrderEditing = false;
			this.rebuildView();
		});

		const saveBtn = parent.createEl("button", {
			cls: "smart-explorer-save-view",
			text: "Save",
		});
		saveBtn.addEventListener("mouseenter", (e) => this.showTooltip("Save current view", e));
		saveBtn.addEventListener("mouseleave", () => this.hideTooltip());
		saveBtn.addEventListener("click", () => {
			const name = activeWindow.prompt("Save view name", "");
			if (!name || name.trim().length === 0) return;
			const view = {
				id: `custom-${Date.now()}`,
				name: name.trim(),
				query: cloneSavedViewQuery(this.query),
			};
			this.plugin.settings.savedViews.push(view);
			this.activeSavedViewId = view.id;
			void this.plugin.saveSettings();
			this.rebuildView();
		});

		const deleteBtn = parent.createEl("button", {
			cls: "smart-explorer-delete-view",
			text: "Delete",
		});
		const isCustomView = this.activeSavedViewId?.startsWith("custom-") ?? false;
		deleteBtn.disabled = !isCustomView;
		deleteBtn.addEventListener("mouseenter", (e) => this.showTooltip("Delete saved view", e));
		deleteBtn.addEventListener("mouseleave", () => this.hideTooltip());
		deleteBtn.addEventListener("click", () => {
			if (!this.activeSavedViewId?.startsWith("custom-")) return;
			this.plugin.settings.savedViews = this.plugin.settings.savedViews.filter(
				(view) => view.id !== this.activeSavedViewId,
			);
			this.activeSavedViewId = null;
			void this.plugin.saveSettings();
			this.rebuildView();
		});
	}

	private rebuildView() {
		const container = this.containerEl.children[1] as HTMLElement;
		this.renderShell(container);
		this.renderList();
	}

	private modifiedRangeValue(): string {
		const option = MODIFIED_RANGE_OPTIONS.find((o) => o.days === this.query.modifiedWithinDays);
		return option?.value ?? "all";
	}

	private resolvedViewMode(): ViewMode {
		return resolveExplorerViewMode(this.viewMode, this.query.sort);
	}

	private registerKeyboardShortcuts(container: HTMLElement) {
		container.onkeydown = (e) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
				e.preventDefault();
				this.searchInput?.focus();
				this.searchInput?.select();
				return;
			}

			if (e.key === "Escape") {
				if (this.query.searchText) {
					e.preventDefault();
					this.query.searchText = "";
					this.activeSavedViewId = null;
					if (this.searchInput) this.searchInput.value = "";
					this.renderList();
					return;
				}
				if (this.filterRow && !this.filterRow.classList.contains("is-collapsed")) {
					e.preventDefault();
					this.filterRow.classList.add("is-collapsed");
				}
			}
		};
	}

	private createToggle(
		parent: HTMLElement,
		label: string,
		cls: string,
		onClick: () => void,
		tooltip?: string,
	) {
		const btn = parent.createEl("button", { cls, text: label });
		if (tooltip) {
			btn.addEventListener("mouseenter", (e) => this.showTooltip(tooltip, e));
			btn.addEventListener("mouseleave", () => this.hideTooltip());
		}
		btn.addEventListener("click", onClick);
		return btn;
	}

	private updateToggleStates(row: HTMLElement) {
		const mdBtn = row.querySelector(".smart-explorer-toggle-md");
		const attachBtn = row.querySelector(".smart-explorer-toggle-attach");
		if (mdBtn) mdBtn.classList.toggle("is-active", this.query.markdownOnly);
		if (attachBtn) attachBtn.classList.toggle("is-active", this.query.attachmentsOnly);
	}

	private updateManualOrderControls() {
		const isManualSort = this.query.sort === "manual";
		if (this.manualEditBtn) {
			this.manualEditBtn.disabled = !isManualSort;
			this.manualEditBtn.classList.toggle("is-active", isManualSort && this.manualOrderEditing);
			this.manualEditBtn.setText(this.manualOrderEditing ? "Done" : "Edit order");
		}
		if (this.manualUndoBtn) {
			this.manualUndoBtn.disabled = !isManualSort || this.manualOrderUndoStack.length === 0;
		}
		if (this.listContainer) {
			this.listContainer.classList.toggle("is-manual-editing", isManualSort && this.manualOrderEditing);
		}
	}

	private updateViewModeControl() {
		if (!this.viewModeBtn) return;
		const mode = this.resolvedViewMode();
		this.viewModeBtn.setText(mode === "tree" ? "Tree" : "List");
		this.viewModeBtn.classList.toggle("is-active", mode === "tree");
		this.viewModeBtn.disabled = this.query.sort === "manual";
	}

	private populateExtensions(select: HTMLSelectElement) {
		const currentValue = this.query.extension ?? select.value;
		while (select.options.length > 1) select.remove(1);
		const extensions = this.fileIndex.getExtensions();
		for (const ext of extensions) {
			select.createEl("option", { value: ext, text: `.${ext}` });
		}
		select.value = currentValue || "";
	}

	private renderList() {
		if (!this.listContainer) return;
		if (this.virtualList) {
			this.virtualList.destroy();
			this.virtualList = null;
		}
		if (this.dragSortManager) {
			this.dragSortManager.destroy();
			this.dragSortManager = null;
		}
		this.listContainer.empty();
		this.listContainer.setAttribute("role", "listbox");

		const hiddenExts = new Set(this.plugin.settings.hiddenExtensions);

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

		if (this.query.sort === "manual") {
			this.initializeManualOrder(records);
		}

		const sections = buildSections(records, this.query, this.manualOrderIndex);

		if (sections.length === 0 || sections.every((s) => s.records.length === 0)) {
			const empty = this.listContainer.createDiv({ cls: "smart-explorer-empty" });
			empty.createSpan({ text: "No files match your filters." });
			const clearBtn = empty.createEl("button", { text: "Clear filters", cls: "smart-explorer-clear-btn" });
			clearBtn.addEventListener("click", () => {
				this.query = {
					searchText: "",
					sort: this.plugin.settings.defaultSort,
					group: this.plugin.settings.defaultGroup,
					extension: null,
					markdownOnly: false,
					attachmentsOnly: false,
					modifiedWithinDays: null,
				};
				this.manualOrderEditing = false;
				this.activeSavedViewId = null;
				const container = this.containerEl.children[1] as HTMLElement;
				this.renderShell(container);
				this.renderList();
			});
			return;
		}

		const displayed = sections.reduce((n, s) => n + s.records.length, 0);
		if (this.resolvedViewMode() === "tree") {
			const tree = buildTree(records, this.query, this.manualOrderIndex);
			for (const node of tree.children) {
				this.listContainer.appendChild(this.createTreeNodeElement(node));
			}
			this.updateFileCount(displayed, records.length);
			this.updateViewModeControl();
			this.updateManualOrderControls();
			return;
		}

		const useVirtual = this.query.group === "none" && VirtualList.shouldVirtualize(displayed);
		const isManualSort = this.query.sort === "manual";

		if (useVirtual) {
			const allRecords = sections[0]!.records;
			this.virtualList = new VirtualList(this.listContainer);
			this.virtualList.setItems(allRecords.map((record) => () => this.createRowElement(record)));
		} else {
			for (const section of sections) {
				if (section.records.length === 0) continue;
				if (this.query.group !== "none") {
					const header = this.listContainer.createDiv({ cls: "smart-explorer-section-header" });
					header.setText(`${section.title} (${section.records.length})`);
				}
				for (const record of section.records) {
					this.listContainer.appendChild(this.createRowElement(record));
				}
			}
		}

		if (isManualSort && this.manualOrderEditing && this.listContainer) {
			const rowHeight = Platform.isMobile ? 44 : 28;
			this.dragSortManager = new DragSortManager(this.listContainer, {
				getRowHeight: () => rowHeight,
				onReorder: (path, toIndex, sectionId) => this.handleManualReorder(path, toIndex, sections, sectionId),
			});
			this.dragSortManager.enable();

			// Attach drag handlers to rendered rows
			for (const section of sections) {
				for (const record of section.records) {
					const row = this.listContainer.querySelector<HTMLElement>(
						`.smart-explorer-row[data-path="${CSS.escape(record.path)}"]`,
					);
					if (row) {
						this.dragSortManager.attachRow(row, record.path, section.id);
					}
				}
			}

			if (this.virtualList) {
				this.virtualList.onAfterRender = () => this.dragSortManager?.reapplyDragClass();
			}
		}

		this.updateFileCount(displayed, records.length);
		this.updateViewModeControl();
		this.updateManualOrderControls();
	}

	private createTreeNodeElement(node: ExplorerTreeNode): HTMLElement {
		if (node.type === "folder") {
			const details = createEl("details", { cls: "smart-explorer-tree-folder" });
			details.open = true;
			const summary = details.createEl("summary", { cls: "smart-explorer-tree-folder-summary" });
			summary.style.setProperty("--smart-explorer-depth", String(node.depth));
			summary.createSpan({ cls: "smart-explorer-tree-disclosure", text: "›" });
			summary.createSpan({ cls: "smart-explorer-tree-folder-icon", text: "▣" });
			summary.createSpan({ cls: "smart-explorer-tree-name", text: node.name });
			summary.createSpan({ cls: "smart-explorer-tree-count", text: String(countTreeFiles(node)) });
			const children = details.createDiv({ cls: "smart-explorer-tree-children" });
			for (const child of node.children) {
				children.appendChild(this.createTreeNodeElement(child));
			}
			return details;
		}

		const row = this.createRowElement(node.record);
		row.classList.add("smart-explorer-tree-file");
		row.style.setProperty("--smart-explorer-depth", String(node.depth));
		return row;
	}

	private createRowElement(record: FileRecord): HTMLElement {
		const row = createDiv({ cls: "smart-explorer-row" });
		row.dataset.path = record.path;
		row.setAttribute("tabindex", "0");
		row.setAttribute("role", "option");
		if (record.path === this.selectedPath) {
			row.classList.add("is-selected");
		}
		if (this.query.sort === "manual" && this.manualOrderEditing) {
			row.classList.add("is-order-editable");
		}
		row.createSpan({ cls: "smart-explorer-row-name", text: record.basename });
		const meta = row.createSpan({ cls: "smart-explorer-row-meta" });
		meta.createSpan({ cls: "smart-explorer-row-parent", text: formatFileParent(record.parentPath) });
		meta.createSpan({ cls: "smart-explorer-row-date", text: formatFileModifiedDate(record.mtime) });
		if (record.extension) {
			row.createSpan({ cls: "smart-explorer-row-ext", text: `.${record.extension}` });
		}
		const tooltipText = `${record.basename}${record.extension ? "." + record.extension : ""}\nCreated: ${this.formatDate(record.ctime)}\nModified: ${this.formatDate(record.mtime)}`;
		row.addEventListener("mouseenter", (e) => this.showTooltip(tooltipText, e));
		row.addEventListener("mouseleave", () => this.hideTooltip());
		const activate = () => {
			this.selectedPath = record.path;
			void this.openFile(record.path);
			this.highlightSelected();
		};
		row.addEventListener("click", activate);
		row.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				activate();
			} else if (e.key === "ArrowDown") {
				e.preventDefault();
				(row.nextElementSibling as HTMLElement)?.focus();
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				(row.previousElementSibling as HTMLElement)?.focus();
			}
		});

		row.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			this.showContextMenu(e, record);
		});

		if (this.query.sort !== "manual") {
			row.draggable = true;
			row.addEventListener("dragstart", (e) => {
				e.dataTransfer?.setData("text/plain", record.path);
				e.dataTransfer?.setData("text/uri-list", record.path);
				const app = this.app as unknown as { dragManager?: { handleDrag?: (e: DragEvent, info: Record<string, unknown>) => void } };
				app.dragManager?.handleDrag?.(e, {
					source: "smart-explorer",
					type: "file",
					file: this.app.vault.getAbstractFileByPath(record.path),
				});
			});
		}

		return row;
	}

	private updateFileCount(displayed: number, total: number) {
		if (!this.fileCountEl) return;
		this.fileCountEl.setText(displayed === total ? `${total} files` : `${displayed} of ${total} files`);
	}

	private formatDate(ts: number): string {
		const d = new Date(ts);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
	}

	private showTooltip(text: string, e: MouseEvent) {
		if (!this.tooltipEl) {
			this.tooltipEl = createDiv({ cls: "smart-explorer-tooltip" });
			activeDocument.body.appendChild(this.tooltipEl);
		}
		this.tooltipEl.textContent = text;
		this.tooltipEl.style.left = `${e.clientX + 12}px`;
		this.tooltipEl.style.top = `${e.clientY + 12}px`;
	}

	private hideTooltip() {
		if (this.tooltipEl) {
			this.tooltipEl.remove();
			this.tooltipEl = null;
		}
	}

	private buildManualOrderIndex() {
		this.manualOrderIndex = new Map(
			this.plugin.settings.manualOrder.map((p, i) => [p, i]),
		);
	}

	private initializeManualOrder(records: FileRecord[]) {
		const order = this.plugin.settings.manualOrder;
		if (order.length === 0) {
			const currentSorted = buildSections(records, {
				...this.query,
				sort: this.plugin.settings.defaultSort === "manual" ? "name-asc" : this.plugin.settings.defaultSort,
			});
			for (const section of currentSorted) {
				for (const r of section.records) {
					order.push(r.path);
				}
			}
			this.scheduleSaveOrder();
		}
		this.buildManualOrderIndex();
	}

	private handleManualReorder(
		draggedPath: string,
		toIndex: number,
		sections: { id: string; records: FileRecord[] }[],
		sectionId?: string,
	) {
		if (!this.manualOrderEditing) return;
		const order = this.plugin.settings.manualOrder;
		const nextOrder = reorderManualOrder(
			order,
			draggedPath,
			toIndex,
			sections,
			this.query.group,
			sectionId,
		);
		if (nextOrder.join("\n") === order.join("\n")) return;
		this.manualOrderUndoStack.push([...order]);
		if (this.manualOrderUndoStack.length > 20) {
			this.manualOrderUndoStack.shift();
		}
		this.plugin.settings.manualOrder = nextOrder;
		this.buildManualOrderIndex();
		const scrollTop = this.listContainer?.scrollTop ?? 0;
		this.renderList();
		if (this.listContainer) this.listContainer.scrollTop = scrollTop;
		this.scheduleSaveOrder();
		this.updateManualOrderControls();
	}

	private undoManualReorder() {
		if (this.query.sort !== "manual") return;
		const previousOrder = this.manualOrderUndoStack.pop();
		if (!previousOrder) return;
		this.plugin.settings.manualOrder = previousOrder;
		this.buildManualOrderIndex();
		const scrollTop = this.listContainer?.scrollTop ?? 0;
		this.renderList();
		if (this.listContainer) this.listContainer.scrollTop = scrollTop;
		this.scheduleSaveOrder();
		this.updateManualOrderControls();
	}

	private scheduleSaveOrder() {
		if (this.saveOrderTimeout) window.clearTimeout(this.saveOrderTimeout);
		this.saveOrderTimeout = window.setTimeout(() => {
			// Prune deleted paths
			const allPaths = new Set(this.fileIndex.getAll().map((r) => r.path));
			this.plugin.settings.manualOrder = this.plugin.settings.manualOrder.filter(
				(p) => allPaths.has(p),
			);
			void this.plugin.saveSettings();
		}, 500);
	}

	private showContextMenu(e: MouseEvent, record: FileRecord) {
		const menu = new Menu();
		menu.addItem((item) =>
			item.setTitle("Open in new tab").setIcon("file-plus").onClick(() => {
				const file = this.app.vault.getAbstractFileByPath(record.path);
				if (file instanceof TFile) {
					void this.app.workspace.getLeaf("tab").openFile(file);
				}
			}),
		);
		menu.addItem((item) =>
			item.setTitle("Copy path").setIcon("copy").onClick(() => {
				void navigator.clipboard.writeText(record.path);
			}),
		);
		menu.showAtMouseEvent(e);
	}

	private highlightSelected() {
		if (!this.listContainer) return;
		const rows = this.listContainer.querySelectorAll(".smart-explorer-row");
		rows.forEach((el) => {
			const row = el as HTMLElement;
			row.classList.toggle("is-selected", row.dataset.path === this.selectedPath);
		});
	}

	private async openFile(path: string) {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			let leaf = this.app.workspace.getLeaf(false);
			if (leaf.view?.getViewType() === SMART_EXPLORER_VIEW_TYPE) {
				leaf = this.app.workspace.getLeaf("tab");
			}
			await leaf.openFile(file);
		}
	}
}

function countTreeFiles(node: ExplorerTreeNode): number {
	if (node.type === "file") return 1;
	return node.children.reduce((count, child) => count + countTreeFiles(child), 0);
}
