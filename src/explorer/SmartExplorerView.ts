import { ItemView, Menu, Platform, setIcon, TFile, WorkspaceLeaf } from "obsidian";
import { SMART_EXPLORER_VIEW_TYPE } from "../constants";
import { FileIndex } from "./FileIndex";
import { VirtualList } from "./VirtualList";
import { DragSortManager } from "./DragSortManager";
import { buildSections } from "./FileTreeModel";
import { buildTree } from "./TreeModel";
import type { ExplorerTreeNode } from "./TreeModel";
import { reorderManualOrder } from "./manualOrder";
import { formatFileModifiedDate, formatFileParent } from "./fileRow";
import { formatTreeFolderTooltip } from "./treeFolderInfo";
import { resolveExplorerViewMode } from "./viewMode";
import { clearSearchAndFilters, hasActiveSearchOrFilters } from "./filterState";
import type { ExplorerQuery, FileKind, FileRecord, SortMode, GroupMode, ViewMode } from "../types";

import type SmartExplorerPlugin from "../main";
import { GROUP_OPTIONS } from "../settings/settings-helpers";

const MODIFIED_RANGE_OPTIONS: { value: string; text: string; days: number | null }[] = [
	{ value: "all", text: "Any time", days: null },
	{ value: "1d", text: "Last day", days: 1 },
	{ value: "7d", text: "Last 7 days", days: 7 },
	{ value: "30d", text: "Last 30 days", days: 30 },
];

const FILE_KIND_OPTIONS: { value: FileKind; text: string }[] = [
	{ value: "all", text: "All" },
	{ value: "markdown", text: "Markdown" },
	{ value: "attachments", text: "Attachments" },
	{ value: "images", text: "Images" },
];

const COMPACT_SORT_OPTIONS: { value: SortMode; text: string }[] = [
	{ value: "name-asc", text: "A-Z" },
	{ value: "name-desc", text: "Z-A" },
	{ value: "modified-new", text: "Mod new" },
	{ value: "modified-old", text: "Mod old" },
	{ value: "created-new", text: "New" },
	{ value: "created-old", text: "Old" },
	{ value: "extension", text: "Ext" },
	{ value: "size", text: "Size" },
	{ value: "manual", text: "Manual" },
];

const LIST_WHEEL_SCROLL_MULTIPLIER = 0.45;

export class SmartExplorerView extends ItemView {
	private plugin: SmartExplorerPlugin;
	private fileIndex: FileIndex;
	private query: ExplorerQuery;
	private viewMode: ViewMode = "tree";
	private listContainer: HTMLElement | null = null;
	private viewModeBtn: HTMLButtonElement | null = null;
	private manualUndoBtn: HTMLButtonElement | null = null;
	private fileCountEl: HTMLElement | null = null;
	private clearFiltersBtn: HTMLButtonElement | null = null;
	private searchInput: HTMLInputElement | null = null;
	private searchRow: HTMLElement | null = null;
	private searchToggleBtn: HTMLButtonElement | null = null;
	private filterRow: HTMLElement | null = null;
	private filterToggleBtn: HTMLButtonElement | null = null;
	private selectedPath: string | null = null;
	private virtualList: VirtualList | null = null;
	private searchTimeout: number | null = null;
	private rebuildTimeout: number | null = null;
	private dragSortManager: DragSortManager | null = null;
	private manualOrderIndex: Map<string, number> = new Map();
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
			fileKind: "all",
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
		this.listContainer.addEventListener("wheel", (e) => this.handleListWheel(e), { passive: false });
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
		this.manualUndoBtn = null;
		this.clearFiltersBtn = null;
		this.searchInput = null;
		this.searchRow = null;
		this.searchToggleBtn = null;
		this.filterRow = null;
		this.filterToggleBtn = null;
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
			this.renderList();
		}, 300);
	}

	private handleListWheel(e: WheelEvent) {
		if (!this.listContainer || e.ctrlKey) return;
		e.preventDefault();
		this.listContainer.scrollTop += e.deltaY * LIST_WHEEL_SCROLL_MULTIPLIER;
		this.listContainer.scrollLeft += e.deltaX * LIST_WHEEL_SCROLL_MULTIPLIER;
	}

	private renderToolbar(container: HTMLElement) {
		const toolbar = container.createDiv({ cls: "smart-explorer-toolbar" });

		const row1 = toolbar.createDiv({ cls: "smart-explorer-toolbar-row" });
		this.viewModeBtn = row1.createEl("button", {
			cls: "smart-explorer-view-mode",
		});
		this.viewModeBtn.addEventListener("mouseenter", (e) => this.showTooltip(this.viewModeTooltip(), e));
		this.viewModeBtn.addEventListener("mouseleave", () => this.hideTooltip());
		this.viewModeBtn.addEventListener("click", () => {
			this.viewMode = this.viewMode === "tree" ? "list" : "tree";
			this.renderList();
		});
		this.createSelect(row1, COMPACT_SORT_OPTIONS, "smart-explorer-sort", (v) => {
			this.query.sort = v as SortMode;
			this.updateManualOrderControls();
			this.updateViewModeControl();
			this.renderList();
		}, this.query.sort);

		this.manualUndoBtn = row1.createEl("button", {
			cls: "smart-explorer-manual-undo",
		});
		setIcon(this.manualUndoBtn, "undo");
		this.manualUndoBtn.setAttribute("aria-label", "Undo manual reorder");
		this.manualUndoBtn.addEventListener("mouseenter", (e) => this.showTooltip("Undo manual reorder", e));
		this.manualUndoBtn.addEventListener("mouseleave", () => this.hideTooltip());
		this.manualUndoBtn.addEventListener("click", () => this.undoManualReorder());

		const searchToggleBtn = row1.createEl("button", {
			cls: "smart-explorer-search-toggle",
		});
		this.searchToggleBtn = searchToggleBtn;
		setIcon(searchToggleBtn, "search");
		searchToggleBtn.setAttribute("aria-label", "Show search");
		searchToggleBtn.addEventListener("mouseenter", (e) => this.showTooltip("Show search", e));
		searchToggleBtn.addEventListener("mouseleave", () => this.hideTooltip());
		searchToggleBtn.addEventListener("click", () => {
			this.toggleSearchRow();
		});

		const filterToggleBtn = row1.createEl("button", {
			cls: "smart-explorer-filter-toggle",
		});
		this.filterToggleBtn = filterToggleBtn;
		setIcon(filterToggleBtn, "sliders-horizontal");
		filterToggleBtn.setAttribute("aria-label", "Show filters");

		const row2 = toolbar.createDiv({ cls: "smart-explorer-toolbar-row smart-explorer-search-row is-collapsed" });
		this.searchRow = row2;
		const searchInput = row2.createEl("input", {
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
				this.renderList();
			}, 200);
		});

		const filterRow = toolbar.createDiv({ cls: "smart-explorer-toolbar-row smart-explorer-toolbar-filters" });
		this.filterRow = filterRow;
		filterRow.classList.add("is-collapsed");
		filterToggleBtn.addEventListener("mouseenter", (e) => this.showTooltip("Show filters", e));
		filterToggleBtn.addEventListener("mouseleave", () => this.hideTooltip());
		filterToggleBtn.addEventListener("click", () => {
			filterRow.classList.toggle("is-collapsed");
			filterToggleBtn.classList.toggle(
				"is-active",
				this.hasActiveFilterControls() || !filterRow.classList.contains("is-collapsed"),
			);
		});

		this.createSelect(filterRow, GROUP_OPTIONS, "smart-explorer-group", (v) => {
			this.query.group = v as GroupMode;
			this.renderList();
		}, this.query.group);

		this.createSelect(filterRow, FILE_KIND_OPTIONS, "smart-explorer-kind", (v) => {
			this.query.fileKind = v as FileKind;
			this.query.extension = null;
			this.renderList();
		}, this.query.fileKind);

		this.createSelect(
			filterRow,
			MODIFIED_RANGE_OPTIONS.map((o) => ({ value: o.value, text: o.text })),
			"smart-explorer-modified",
			(v) => {
				const opt = MODIFIED_RANGE_OPTIONS.find((o) => o.value === v);
				this.query.modifiedWithinDays = opt?.days ?? null;
				this.renderList();
			},
			this.modifiedRangeValue(),
		);

		const countRow = toolbar.createDiv({ cls: "smart-explorer-count-row" });
		this.fileCountEl = countRow.createDiv({ cls: "smart-explorer-file-count" });
		this.clearFiltersBtn = countRow.createEl("button", { cls: "smart-explorer-clear-filters is-hidden" });
		setIcon(this.clearFiltersBtn, "x");
		this.clearFiltersBtn.setAttribute("aria-label", "Clear search and filters");
		this.clearFiltersBtn.addEventListener("mouseenter", (e) => this.showTooltip("Clear search and filters", e));
		this.clearFiltersBtn.addEventListener("mouseleave", () => this.hideTooltip());
		this.clearFiltersBtn.addEventListener("click", () => this.clearSearchAndFilters());

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

	private rebuildView() {
		const container = this.containerEl.children[1] as HTMLElement;
		this.renderShell(container);
		this.renderList();
	}

	private clearSearchAndFilters() {
		this.query = clearSearchAndFilters(this.query);
		this.rebuildView();
	}

	private toggleSearchRow(forceOpen?: boolean) {
		if (!this.searchRow || !this.searchToggleBtn) return;
		const shouldOpen = forceOpen ?? this.searchRow.classList.contains("is-collapsed");
		this.searchRow.classList.toggle("is-collapsed", !shouldOpen);
		this.searchToggleBtn.classList.toggle("is-active", shouldOpen || this.query.searchText.trim().length > 0);
		if (shouldOpen) {
			this.searchInput?.focus();
			this.searchInput?.select();
		}
	}

	private hasActiveFilterControls(): boolean {
		return this.query.extension !== null || this.query.fileKind !== "all" || this.query.modifiedWithinDays !== null;
	}

	private modifiedRangeValue(): string {
		const option = MODIFIED_RANGE_OPTIONS.find((o) => o.days === this.query.modifiedWithinDays);
		return option?.value ?? "all";
	}

	private resolvedViewMode(): ViewMode {
		return resolveExplorerViewMode(this.viewMode, this.query.sort);
	}

	private viewModeTooltip(): string {
		if (this.query.sort === "manual") return "Manual sort uses list view";
		return this.resolvedViewMode() === "tree" ? "Tree view" : "List view";
	}

	private registerKeyboardShortcuts(container: HTMLElement) {
		container.onkeydown = (e) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
				e.preventDefault();
				this.toggleSearchRow(true);
				this.searchInput?.focus();
				this.searchInput?.select();
				return;
			}

			if (e.key === "Escape") {
				if (this.query.searchText) {
					e.preventDefault();
					this.query.searchText = "";
					if (this.searchInput) this.searchInput.value = "";
					this.renderList();
					return;
				}
				if (this.searchRow && !this.searchRow.classList.contains("is-collapsed")) {
					e.preventDefault();
					this.searchRow.classList.add("is-collapsed");
					this.searchToggleBtn?.classList.toggle("is-active", this.query.searchText.trim().length > 0);
					return;
				}
				if (this.filterRow && !this.filterRow.classList.contains("is-collapsed")) {
					e.preventDefault();
					this.filterRow.classList.add("is-collapsed");
				}
			}
		};
	}

	private updateManualOrderControls() {
		const isManualSort = this.query.sort === "manual";
		if (this.manualUndoBtn) {
			this.manualUndoBtn.classList.toggle("is-hidden", !isManualSort);
			this.manualUndoBtn.disabled = !isManualSort || this.manualOrderUndoStack.length === 0;
		}
		if (this.listContainer) {
			this.listContainer.classList.toggle("is-manual-sorting", isManualSort);
		}
	}

	private updateViewModeControl() {
		if (!this.viewModeBtn) return;
		const mode = this.resolvedViewMode();
		this.viewModeBtn.empty();
		setIcon(this.viewModeBtn, mode === "tree" ? "folder-tree" : "list");
		this.viewModeBtn.setAttribute("aria-label", this.viewModeTooltip());
		this.viewModeBtn.classList.toggle("is-active", mode === "tree");
		this.viewModeBtn.disabled = this.query.sort === "manual";
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
				this.clearSearchAndFilters();
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

		if (isManualSort && this.listContainer) {
			const rowHeight = Platform.isMobile ? 44 : 28;
			this.dragSortManager = new DragSortManager(this.listContainer, {
				getRowHeight: () => rowHeight,
				onReorder: (path, toIndex, sectionId) => this.handleManualReorder(path, toIndex, sections, sectionId),
			});
			this.dragSortManager.enable();

			this.attachManualDragRows(sections);

			if (this.virtualList) {
				this.virtualList.onAfterRender = () => {
					this.attachManualDragRows(sections);
					this.dragSortManager?.reapplyDragClass();
				};
			}
		}

		this.updateFileCount(displayed, records.length);
		this.updateViewModeControl();
		this.updateManualOrderControls();
	}

	private attachManualDragRows(sections: { id: string; records: FileRecord[] }[]) {
		if (!this.listContainer || !this.dragSortManager) return;
		this.dragSortManager.clearRows();
		for (const section of sections) {
			for (const record of section.records) {
				const row = this.listContainer.querySelector<HTMLElement>(
					`.smart-explorer-row[data-path="${CSS.escape(record.path)}"]`,
				);
				if (!row) continue;
				const handle = row.querySelector<HTMLElement>(".smart-explorer-row-drag-handle");
				this.dragSortManager.attachRow(row, record.path, section.id, handle ?? row);
			}
		}
	}

	private createTreeNodeElement(node: ExplorerTreeNode): HTMLElement {
		if (node.type === "folder") {
			const details = createEl("details", { cls: "smart-explorer-tree-folder" });
			details.open = true;
			const summary = details.createEl("summary", { cls: "smart-explorer-tree-folder-summary" });
			summary.style.setProperty("--smart-explorer-depth", String(node.depth));
			summary.createSpan({ cls: "smart-explorer-tree-disclosure", text: "›" });
			const folderIcon = summary.createSpan({ cls: "smart-explorer-tree-folder-icon" });
			setIcon(folderIcon, "folder");
			summary.createSpan({ cls: "smart-explorer-tree-name", text: node.name });
			summary.createSpan({ cls: "smart-explorer-tree-count", text: `${countTreeFiles(node)} files` });
			summary.addEventListener("mouseenter", (e) => this.showTooltip(formatTreeFolderTooltip(node), e));
			summary.addEventListener("mouseleave", () => this.hideTooltip());
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
		if (this.query.sort === "manual") {
			const handle = row.createSpan({ cls: "smart-explorer-row-drag-handle" });
			setIcon(handle, "grip-vertical");
			handle.setAttribute("aria-label", "Drag to reorder");
			handle.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
			});
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
		const hasFilters = hasActiveSearchOrFilters(this.query);
		this.clearFiltersBtn?.classList.toggle("is-hidden", !hasFilters);
		this.searchToggleBtn?.classList.toggle(
			"is-active",
			this.query.searchText.trim().length > 0 || !(this.searchRow?.classList.contains("is-collapsed") ?? true),
		);
		this.filterToggleBtn?.classList.toggle(
			"is-active",
			this.hasActiveFilterControls() || !(this.filterRow?.classList.contains("is-collapsed") ?? true),
		);
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
