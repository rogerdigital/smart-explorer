import { ItemView, Menu, Modal, Notice, Platform, Setting, setIcon, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import { SMART_EXPLORER_VIEW_TYPE } from "../constants";
import { FileIndex } from "./FileIndex";
import { VirtualList } from "./VirtualList";
import { DragSortManager } from "./DragSortManager";
import { buildSections } from "./FileTreeModel";
import { buildTree } from "./TreeModel";
import type { ExplorerTreeNode } from "./TreeModel";
import { reconcileManualOrder, reorderManualOrder } from "./manualOrder";
import { formatFileModifiedDate, formatFileParent } from "./fileRow";
import { formatTreeFolderTooltip } from "./treeFolderInfo";
import { resolveExplorerGroupMode, resolveExplorerViewMode, resolveManualSeedSort } from "./viewMode";
import { clearSearchAndFilters, hasActiveSearchOrFilters } from "./filterState";
import { areAllTreeFoldersExpanded, shouldOpenTreeFolder } from "./treeExpansion";
import { appendMarkdownExtension, buildCreationPath, buildFileRenamePath, buildSiblingPath, getParentFolderPath, getPathName, resolveCreationFolder } from "./creationPath";
import { revealPathInContainer } from "./revealPath";
import { isTouchMovePastThreshold, TOUCH_LONG_PRESS_MS } from "./touchLongPress";
import type { ExplorerQuery, FileKind, FileRecord, SortMode, GroupMode, ViewMode } from "../types";

import type SmartExplorerPlugin from "../main";
import { GROUP_OPTIONS, SORT_OPTIONS } from "../settings/settings-helpers";

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

type InlineEditState =
	| { kind: "create-note"; folderPath: string; value: string }
	| { kind: "create-folder"; folderPath: string; value: string }
	| { kind: "rename-file"; path: string; value: string }
	| { kind: "rename-folder"; path: string; value: string };

export class SmartExplorerView extends ItemView {
	private plugin: SmartExplorerPlugin;
	private fileIndex: FileIndex;
	private query: ExplorerQuery;
	private viewMode: ViewMode = "tree";
	private listContainer: HTMLElement | null = null;
	private viewModeBtn: HTMLButtonElement | null = null;
	private newNoteBtn: HTMLButtonElement | null = null;
	private newFolderBtn: HTMLButtonElement | null = null;
	private manualUndoBtn: HTMLButtonElement | null = null;
	private fileCountEl: HTMLElement | null = null;
	private clearFiltersBtn: HTMLButtonElement | null = null;
	private collapseTreeBtn: HTMLButtonElement | null = null;
	private revealActiveFileBtn: HTMLButtonElement | null = null;
	private searchInput: HTMLInputElement | null = null;
	private searchRow: HTMLElement | null = null;
	private searchToggleBtn: HTMLButtonElement | null = null;
	private filterRow: HTMLElement | null = null;
	private filterToggleBtn: HTMLButtonElement | null = null;
	private groupSelect: HTMLSelectElement | null = null;
	private selectedPath: string | null = null;
	private selectedFolderPath: string | null = null;
	private treeExpandedPaths: Set<string> = new Set();
	private visibleTreeFolderPaths: string[] = [];
	private virtualList: VirtualList | null = null;
	private searchTimeout: number | null = null;
	private rebuildTimeout: number | null = null;
	private dragSortManager: DragSortManager | null = null;
	private manualOrderIndex: Map<string, number> = new Map();
	private manualOrderUndoStack: string[][] = [];
	private saveOrderTimeout: number | null = null;
	private tooltipEl: HTMLElement | null = null;
	private inlineEdit: InlineEditState | null = null;
	// Seed sort for the current manual-sort session: the sort the user was
	// viewing right before switching into manual. Used to initialize the order
	// on first entry and as the fallback order for files added during the session.
	private manualSeedSort: Exclude<SortMode, "manual"> = "name-asc";
	private manualHintEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: SmartExplorerPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.fileIndex = new FileIndex(this.app);
		const settings = this.plugin.settings;
		this.manualSeedSort = settings.defaultSort === "manual" ? "name-asc" : settings.defaultSort;
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
		this.listContainer.addEventListener("contextmenu", (e) => this.showBlankContextMenu(e));
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
		this.newNoteBtn = null;
		this.newFolderBtn = null;
		this.manualUndoBtn = null;
		this.clearFiltersBtn = null;
		this.collapseTreeBtn = null;
		this.revealActiveFileBtn = null;
		this.searchInput = null;
		this.searchRow = null;
		this.searchToggleBtn = null;
		this.filterRow = null;
		this.filterToggleBtn = null;
		this.groupSelect = null;
		this.inlineEdit = null;
		this.manualHintEl = null;
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
			}
			this.scheduleRebuild();
		}));

		this.registerEvent(events.on("delete", (file) => {
			if (file instanceof TFile) {
				this.fileIndex.removeFile(file.path);
				if (this.selectedPath === file.path) {
					this.selectedPath = null;
				}
			} else if (file instanceof TFolder) {
				if (this.selectedFolderPath === file.path || this.selectedFolderPath?.startsWith(`${file.path}/`)) {
					this.selectedFolderPath = null;
				}
				this.collapseFolderPath(file.path);
			}
			this.scheduleRebuild();
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
			} else if (file instanceof TFolder) {
				this.updateFolderPathState(oldPath, file.path);
			}
			this.scheduleRebuild();
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
			const nextSort = v as SortMode;
			this.manualSeedSort = resolveManualSeedSort(this.query.sort, nextSort, this.manualSeedSort);
			this.query.sort = nextSort;
			if (this.query.sort === "manual") {
				this.query.group = "none";
				if (this.groupSelect) this.groupSelect.value = "none";
			}
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
			if (this.query.sort === "manual") return;
			this.query.group = v as GroupMode;
			this.renderList();
		}, this.query.group);
		this.groupSelect = filterRow.querySelector(".smart-explorer-group");

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
		const treeActionGroup = countRow.createDiv({ cls: "smart-explorer-tree-actions" });
		this.newNoteBtn = treeActionGroup.createEl("button", { cls: "smart-explorer-new-note" });
		setIcon(this.newNoteBtn, "file-plus");
		this.newNoteBtn.setAttribute("aria-label", "New note");
		this.newNoteBtn.addEventListener("mouseenter", (e) => this.showTooltip("New note", e));
		this.newNoteBtn.addEventListener("mouseleave", () => this.hideTooltip());
		this.newNoteBtn.addEventListener("click", () => {
			this.startCreateNote();
		});

		this.newFolderBtn = treeActionGroup.createEl("button", { cls: "smart-explorer-new-folder" });
		setIcon(this.newFolderBtn, "folder-plus");
		this.newFolderBtn.setAttribute("aria-label", "New folder");
		this.newFolderBtn.addEventListener("mouseenter", (e) => this.showTooltip("New folder", e));
		this.newFolderBtn.addEventListener("mouseleave", () => this.hideTooltip());
		this.newFolderBtn.addEventListener("click", () => {
			this.startCreateFolder();
		});

		this.collapseTreeBtn = treeActionGroup.createEl("button", { cls: "smart-explorer-toggle-tree" });
		this.collapseTreeBtn.addEventListener("mouseenter", (e) => this.showTooltip(this.treeToggleTooltip(), e));
		this.collapseTreeBtn.addEventListener("mouseleave", () => this.hideTooltip());
		this.collapseTreeBtn.addEventListener("click", () => this.toggleAllFolders());

		this.revealActiveFileBtn = treeActionGroup.createEl("button", { cls: "smart-explorer-reveal-active" });
		setIcon(this.revealActiveFileBtn, "locate-fixed");
		this.revealActiveFileBtn.setAttribute("aria-label", "Reveal active file");
		this.revealActiveFileBtn.addEventListener("mouseenter", (e) => this.showTooltip("Reveal active file", e));
		this.revealActiveFileBtn.addEventListener("mouseleave", () => this.hideTooltip());
		this.revealActiveFileBtn.addEventListener("click", () => this.revealActiveFile());

		this.clearFiltersBtn = treeActionGroup.createEl("button", { cls: "smart-explorer-clear-filters is-hidden" });
		setIcon(this.clearFiltersBtn, "x");
		this.clearFiltersBtn.setAttribute("aria-label", "Clear search and filters");
		this.clearFiltersBtn.addEventListener("mouseenter", (e) => this.showTooltip("Clear search and filters", e));
		this.clearFiltersBtn.addEventListener("mouseleave", () => this.hideTooltip());
		this.clearFiltersBtn.addEventListener("click", () => this.clearSearchAndFilters());

		const countMeta = countRow.createDiv({ cls: "smart-explorer-count-meta" });
		this.fileCountEl = countMeta.createDiv({ cls: "smart-explorer-file-count" });

		this.manualHintEl = toolbar.createDiv({ cls: "smart-explorer-manual-hint is-hidden" });

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

	focusSearch() {
		this.toggleSearchRow(true);
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

	private resolvedGroupMode(): GroupMode {
		return resolveExplorerGroupMode(this.query.group, this.query.sort);
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
		if (this.manualHintEl) {
			if (isManualSort) {
				const seedLabel = SORT_OPTIONS.find((o) => o.value === this.manualSeedSort)?.text ?? "A-Z";
				this.manualHintEl.setText(`Manual order, starting from ${seedLabel}. Drag rows to reorder.`);
				this.manualHintEl.classList.remove("is-hidden");
			} else {
				this.manualHintEl.classList.add("is-hidden");
			}
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
		if (this.groupSelect) {
			this.groupSelect.value = this.resolvedGroupMode();
			this.groupSelect.disabled = this.query.sort === "manual";
			this.groupSelect.classList.toggle("is-hidden", mode === "tree" || this.query.sort === "manual");
		}
		this.updateTreeToggleControl();
		this.collapseTreeBtn?.classList.toggle("is-hidden", mode !== "tree");
		this.revealActiveFileBtn?.classList.toggle("is-hidden", mode !== "tree");
	}

	private renderList() {
		if (!this.listContainer) return;
		// Preserve the scroll position across the full re-render. The container
		// is emptied and rebuilt below; scrollTop must be restored *after* the
		// new content exists (setting it on an empty container gets clamped to
		// 0). The finally block guarantees restoration on every return path,
		// including rename start/commit/cancel and background vault-event
		// rebuilds, so the list never jumps to the top or to a selected row.
		const preservedScrollTop = this.listContainer.scrollTop;
		try {
			this.renderListContent();
		} finally {
			if (this.virtualList) {
				this.virtualList.scrollTo(preservedScrollTop);
			} else if (this.listContainer) {
				this.listContainer.scrollTop = preservedScrollTop;
			}
		}
	}

	private renderListContent() {
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

		const mode = this.resolvedViewMode();
		const hasFilters = hasActiveSearchOrFilters(this.query);
		const folderPaths = mode === "tree" && !hasFilters ? this.fileIndex.getFolderPaths() : [];
		const hasInlineCreate = this.hasInlineCreate();

		if (records.length === 0 && folderPaths.length === 0 && !hasInlineCreate) {
			this.listContainer.createDiv({
				cls: "smart-explorer-empty",
				text: "No files in vault.",
			});
			return;
		}

		if (this.query.sort === "manual") {
			this.initializeManualOrder(records);
		}

		const effectiveQuery = { ...this.query, group: this.resolvedGroupMode() };
		const sections = buildSections(records, effectiveQuery, this.manualOrderIndex);
		const displayed = sections.reduce((n, s) => n + s.records.length, 0);

		if (mode === "tree") {
			if (displayed === 0 && folderPaths.length === 0 && !hasInlineCreate) {
				this.renderNoMatches();
				return;
			}
			this.syncSelectedPathFromActiveFile();
			const tree = buildTree(records, effectiveQuery, this.manualOrderIndex, folderPaths);
			this.visibleTreeFolderPaths = collectTreeFolderPaths(tree.children);
			const rootCreateEl = this.createInlineCreateElement("", 0);
			if (rootCreateEl) {
				this.listContainer.appendChild(rootCreateEl);
			}
			for (const node of tree.children) {
				this.listContainer.appendChild(this.createTreeNodeElement(node));
			}
			this.updateFileCount(displayed, records.length);
			this.updateViewModeControl();
			this.updateManualOrderControls();
			return;
		}

		if (displayed === 0 && !hasInlineCreate) {
			this.renderNoMatches();
			return;
		}

		this.visibleTreeFolderPaths = [];
		const rootCreateEl = this.createInlineCreateElement("", 0, true);
		if (rootCreateEl) {
			this.listContainer.appendChild(rootCreateEl);
		}

		const isManualSort = this.query.sort === "manual";
		const useVirtual = !isManualSort && effectiveQuery.group === "none" && VirtualList.shouldVirtualize(displayed);

		if (useVirtual) {
			const allRecords = sections[0]!.records;
			this.virtualList = new VirtualList(this.listContainer);
			this.virtualList.setItems(allRecords.map((record) => () => this.createRowElement(record)));
		} else {
			for (const section of sections) {
				if (section.records.length === 0) continue;
				if (effectiveQuery.group !== "none") {
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
				onReorder: (path, toIndex, sectionId) => this.handleManualReorder(path, toIndex, sections, effectiveQuery.group, sectionId),
			});
			this.dragSortManager.enable();

			this.attachManualDragRows(sections);
		}

		this.updateFileCount(displayed, records.length);
		this.updateViewModeControl();
		this.updateManualOrderControls();
	}

	private renderNoMatches() {
		if (!this.listContainer) return;
		const empty = this.listContainer.createDiv({ cls: "smart-explorer-empty" });
		empty.createSpan({ text: "No files match your filters." });
		const clearBtn = empty.createEl("button", { text: "Clear filters", cls: "smart-explorer-clear-btn" });
		clearBtn.addEventListener("click", () => {
			this.clearSearchAndFilters();
		});
	}

	private hasInlineCreate(): boolean {
		return this.inlineEdit?.kind === "create-note" || this.inlineEdit?.kind === "create-folder";
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

	private createInlineCreateElement(folderPath: string, depth: number, force = false): HTMLElement | null {
		if (!this.inlineEdit || (this.inlineEdit.kind !== "create-note" && this.inlineEdit.kind !== "create-folder")) {
			return null;
		}
		if (!force && this.inlineEdit.folderPath !== folderPath) return null;
		const row = createDiv({ cls: "smart-explorer-row smart-explorer-inline-edit-row" });
		row.setAttribute("role", "option");
		if (this.resolvedViewMode() === "tree") {
			row.classList.add("smart-explorer-tree-file");
			row.style.setProperty("--smart-explorer-depth", String(depth));
		}
		row.appendChild(this.createInlineEditInput(
			this.inlineEdit.value,
			this.inlineEdit.kind === "create-note" ? "File name" : "Folder name",
		));
		return row;
	}

	private createInlineEditInput(value: string, ariaLabel: string): HTMLInputElement {
		const input = createEl("input", {
			type: "text",
			value,
			cls: "smart-explorer-inline-input",
			attr: { "aria-label": ariaLabel },
		});
		let handled = false;
		input.addEventListener("input", () => {
			if (this.inlineEdit) this.inlineEdit.value = input.value;
		});
		input.addEventListener("click", (e) => e.stopPropagation());
		input.addEventListener("mousedown", (e) => e.stopPropagation());
		input.addEventListener("contextmenu", (e) => e.stopPropagation());
		input.addEventListener("keydown", (e) => {
			e.stopPropagation();
			if (e.key === "Enter") {
				e.preventDefault();
				handled = true;
				void this.commitInlineEdit(input.value);
			} else if (e.key === "Escape") {
				e.preventDefault();
				handled = true;
				this.cancelInlineEdit();
			}
		});
		input.addEventListener("blur", () => {
			if (!handled) this.cancelInlineEdit();
		});
		window.setTimeout(() => {
			// preventScroll keeps focus from scrolling the just-restored list
			// position away (e.g. when entering inline rename/edit) — the row
			// is already in view since the list preserved its scrollTop.
			input.focus({ preventScroll: true });
			input.select();
		}, 0);
		return input;
	}

	private async commitInlineEdit(rawValue: string) {
		const value = rawValue.trim().replace(/^\/+|\/+$/g, "");
		const state = this.inlineEdit;
		if (!state) return;
		if (!value) {
			new Notice("Name cannot be empty.");
			return;
		}

		if (state.kind === "create-note") {
			await this.createNoteFromName(state.folderPath, value);
		} else if (state.kind === "create-folder") {
			await this.createFolderFromName(state.folderPath, value);
		} else if (state.kind === "rename-file" || state.kind === "rename-folder") {
			await this.renameItemToName(state.path, value);
		}
	}

	private cancelInlineEdit() {
		if (!this.inlineEdit) return;
		this.inlineEdit = null;
		this.renderList();
	}

	private createTreeNodeElement(node: ExplorerTreeNode): HTMLElement {
		if (node.type === "folder") {
			const details = createEl("details", { cls: "smart-explorer-tree-folder" });
			details.dataset.path = node.path;
			details.open = shouldOpenTreeFolder(node.path, {
				expandedPaths: this.treeExpandedPaths,
				hasActiveFilters: hasActiveSearchOrFilters(this.query),
				selectedPath: this.selectedPath,
			});
			details.addEventListener("toggle", () => {
				if (details.open) {
					this.treeExpandedPaths.add(node.path);
				} else {
					this.treeExpandedPaths.delete(node.path);
				}
				this.updateTreeToggleControl();
			});
			const summary = details.createEl("summary", { cls: "smart-explorer-tree-folder-summary" });
			summary.classList.toggle("is-selected", this.selectedFolderPath === node.path);
			summary.style.setProperty("--smart-explorer-depth", String(node.depth));
			summary.createSpan({ cls: "smart-explorer-tree-disclosure", text: "›" });
			if (this.inlineEdit?.kind === "rename-folder" && this.inlineEdit.path === node.path) {
				summary.appendChild(this.createInlineEditInput(this.inlineEdit.value, "Folder name"));
			} else {
				summary.createSpan({ cls: "smart-explorer-tree-name", text: node.name });
			}
			summary.createSpan({ cls: "smart-explorer-tree-count", text: `${countTreeFiles(node)} files` });
			summary.addEventListener("mouseenter", (e) => this.showTooltip(formatTreeFolderTooltip(node), e));
			summary.addEventListener("mouseleave", () => this.hideTooltip());
			summary.addEventListener("click", () => {
				this.selectedFolderPath = node.path;
				this.selectedPath = null;
				this.highlightSelected();
			});
			summary.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.selectedFolderPath = node.path;
				this.selectedPath = null;
				this.highlightSelected();
				this.showFolderContextMenu(e, node.path);
			});
			this.attachLongPressMenu(summary, ({ x, y }) => {
				this.selectedFolderPath = node.path;
				this.selectedPath = null;
				this.highlightSelected();
				this.buildFolderContextMenu(node.path).showAtPosition({ x, y });
			});
			const children = details.createDiv({ cls: "smart-explorer-tree-children" });
			const inlineCreateEl = this.createInlineCreateElement(node.path, node.depth + 1);
			if (inlineCreateEl) {
				children.appendChild(inlineCreateEl);
			}
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
		if (this.inlineEdit?.kind === "rename-file" && this.inlineEdit.path === record.path) {
			row.appendChild(this.createInlineEditInput(this.inlineEdit.value, "File name"));
		} else {
			row.createSpan({ cls: "smart-explorer-row-name", text: record.basename });
		}
		const meta = row.createSpan({ cls: "smart-explorer-row-meta" });
		meta.createSpan({ cls: "smart-explorer-row-parent", text: formatFileParent(record.parentPath) });
		meta.createSpan({ cls: "smart-explorer-row-date", text: formatFileModifiedDate(record.mtime) });
		if (record.extension && !record.isMarkdown) {
			row.createSpan({ cls: "smart-explorer-row-ext", text: `.${record.extension}` });
		}
		const tooltipText = `${record.basename}${record.extension ? "." + record.extension : ""}\nCreated: ${this.formatDate(record.ctime)}\nModified: ${this.formatDate(record.mtime)}`;
		row.addEventListener("mouseenter", (e) => this.showTooltip(tooltipText, e));
		row.addEventListener("mouseleave", () => this.hideTooltip());
		const activate = () => {
			this.selectedPath = record.path;
			this.selectedFolderPath = null;
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
		this.attachLongPressMenu(row, ({ x, y }) => {
			this.buildFileContextMenu(record).showAtPosition({ x, y });
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

	private syncSelectedPathFromActiveFile() {
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile) {
			this.selectedPath = activeFile.path;
		}
	}

	private getCreationFolder(folderOverride?: string): string {
		if (folderOverride !== undefined) return folderOverride;
		return resolveCreationFolder({
			selectedFolderPath: this.selectedFolderPath,
			selectedFilePath: this.selectedPath,
			activeFilePath: this.app.workspace.getActiveFile()?.path ?? null,
		});
	}

	startCreateNote(folderOverride?: string) {
		const folderPath = this.getCreationFolder(folderOverride);
		this.inlineEdit = { kind: "create-note", folderPath, value: "Untitled" };
		this.expandFolderAncestors(folderPath);
		this.renderList();
	}

	private async createNoteFromName(folderPath: string, name: string) {
		const fileName = appendMarkdownExtension(name);
		const path = this.getAvailablePath(buildCreationPath(folderPath, fileName));
		try {
			const file = await this.app.vault.create(path, "");
			this.fileIndex.addFile(file);
			this.inlineEdit = null;
			this.selectedPath = file.path;
			this.selectedFolderPath = null;
			this.expandFolderAncestors(getParentFolderPath(file.path));
			this.renderList();
			await this.openFile(file.path);
		} catch (e) {
			new Notice(`Could not create note: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	startCreateFolder(folderOverride?: string) {
		const parentPath = this.getCreationFolder(folderOverride);
		this.inlineEdit = { kind: "create-folder", folderPath: parentPath, value: "New folder" };
		this.expandFolderAncestors(parentPath);
		this.renderList();
	}

	private async createFolderFromName(parentPath: string, name: string) {
		const path = this.getAvailablePath(buildCreationPath(parentPath, name));
		try {
			await this.app.vault.createFolder(path);
			this.inlineEdit = null;
			this.selectedFolderPath = path;
			this.selectedPath = null;
			this.expandFolderAncestors(path);
			this.renderList();
		} catch (e) {
			new Notice(`Could not create folder: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	private promptForConfirmation(title: string, message: string, cta: string): Promise<boolean> {
		return new Promise((resolve) => {
			new ConfirmModal(this.app, title, message, cta, resolve).open();
		});
	}

	private getAvailablePath(path: string): string {
		const normalized = path.replace(/^\/+|\/+$/g, "");
		if (!this.app.vault.getAbstractFileByPath(normalized)) return normalized;
		const parts = normalized.split("/");
		const fileName = parts.pop() ?? normalized;
		const folderPath = parts.join("/");
		const dotIndex = fileName.lastIndexOf(".");
		const hasExtension = dotIndex > 0;
		const base = hasExtension ? fileName.slice(0, dotIndex) : fileName;
		const ext = hasExtension ? fileName.slice(dotIndex) : "";
		for (let i = 1; i < 1000; i++) {
			const candidateName = `${base} ${i}${ext}`;
			const candidate = buildCreationPath(folderPath, candidateName);
			if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
		}
		return normalized;
	}

	private expandFolderAncestors(folderPath: string) {
		if (!folderPath) return;
		const parts = folderPath.split("/");
		for (let i = 0; i < parts.length; i++) {
			this.treeExpandedPaths.add(parts.slice(0, i + 1).join("/"));
		}
	}

	private toggleAllFolders() {
		if (areAllTreeFoldersExpanded(this.visibleTreeFolderPaths, this.treeExpandedPaths)) {
			this.treeExpandedPaths.clear();
			this.selectedFolderPath = null;
		} else {
			this.visibleTreeFolderPaths.forEach((path) => this.treeExpandedPaths.add(path));
		}
		this.renderList();
	}

	private collapseFolderPath(folderPath: string) {
		for (const path of Array.from(this.treeExpandedPaths)) {
			if (path === folderPath || path.startsWith(`${folderPath}/`)) {
				this.treeExpandedPaths.delete(path);
			}
		}
		this.renderList();
	}

	private updateFolderPathState(oldPath: string, newPath: string) {
		this.treeExpandedPaths = new Set(
			Array.from(this.treeExpandedPaths).map((path) => renameNestedPath(path, oldPath, newPath)),
		);
		if (this.selectedFolderPath) {
			this.selectedFolderPath = renameNestedPath(this.selectedFolderPath, oldPath, newPath);
		}
	}

	revealActiveFile() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;
		this.selectedPath = activeFile.path;
		this.selectedFolderPath = null;
		this.expandFolderAncestors(getParentFolderPath(activeFile.path));
		if (this.resolvedViewMode() !== "tree") {
			this.viewMode = "tree";
		}
		this.renderList();
		if (this.listContainer) {
			revealPathInContainer(this.listContainer, activeFile.path);
		}
	}

	private async openFileInLeaf(path: string, leafType: "tab" | "right" | "window") {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		try {
			const leaf = leafType === "right"
				? this.app.workspace.getLeaf("split", "vertical")
				: leafType === "window"
					? this.app.workspace.openPopoutLeaf()
					: this.app.workspace.getLeaf("tab");
			await leaf.openFile(file);
		} catch (e) {
			new Notice(`Could not open file: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	private copyPath(path: string) {
		void navigator.clipboard.writeText(path);
	}

	private async openInDefaultApp(path: string) {
		const shell = getElectronShell();
		const absolutePath = this.getAbsoluteVaultPath(path);
		if (!shell || !absolutePath) {
			new Notice("Open in default app is only available for local desktop vaults.");
			return;
		}
		const error = await shell.openPath(absolutePath);
		if (error) new Notice(`Could not open in default app: ${error}`);
	}

	private revealInFinder(path: string) {
		const shell = getElectronShell();
		const absolutePath = this.getAbsoluteVaultPath(path);
		if (!shell || !absolutePath) {
			new Notice("Reveal in finder is only available for local desktop vaults.");
			return;
		}
		shell.showItemInFolder(absolutePath);
	}

	private getAbsoluteVaultPath(path: string): string | null {
		const adapter = this.app.vault.adapter as unknown;
		if (!hasBasePath(adapter)) return null;
		return `${adapter.getBasePath()}/${path}`;
	}

	private startRenameItem(path: string) {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file) return;
		this.inlineEdit = file instanceof TFile
			? { kind: "rename-file", path, value: file.basename }
			: { kind: "rename-folder", path, value: getPathName(path) };
		this.renderList();
	}

	private async renameItemToName(path: string, nextName: string) {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file) return;
		const currentBasename = file instanceof TFile ? file.basename : getPathName(path);
		if (nextName === currentBasename) {
			this.cancelInlineEdit();
			return;
		}
		const nextPath = file instanceof TFile
			? buildFileRenamePath(path, nextName)
			: buildSiblingPath(path, nextName);
		const existing = this.app.vault.getAbstractFileByPath(nextPath);
		if (existing && existing !== file) {
			new Notice("An item with that name already exists.");
			return;
		}
		try {
			await this.app.vault.rename(file, nextPath);
			this.inlineEdit = null;
			this.selectedPath = file instanceof TFile ? nextPath : null;
			this.selectedFolderPath = file instanceof TFolder ? nextPath : null;
			this.renderList();
		} catch (e) {
			new Notice(`Could not rename item: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	private async deleteItem(path: string) {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file) return;
		const confirmed = await this.promptForConfirmation(
			"Delete item",
			`Move "${path.split("/").pop() ?? path}" to trash?`,
			"Delete",
		);
		if (!confirmed) return;
		try {
			await this.app.fileManager.trashFile(file);
			if (this.selectedPath === path) this.selectedPath = null;
			if (this.selectedFolderPath === path || this.selectedFolderPath?.startsWith(`${path}/`)) {
				this.selectedFolderPath = null;
			}
			this.renderList();
		} catch (e) {
			new Notice(`Could not delete item: ${e instanceof Error ? e.message : String(e)}`);
		}
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
		const seeded = buildSections(records, {
			...this.query,
			sort: this.manualSeedSort,
			group: this.resolvedGroupMode(),
		});
		const fallbackOrder = seeded.flatMap((s) => s.records.map((r) => r.path));
		const reconciled = reconcileManualOrder(order, records, fallbackOrder);
		if (reconciled !== order) {
			this.plugin.settings.manualOrder = reconciled;
			this.scheduleSaveOrder();
		}
		this.buildManualOrderIndex();
	}

	private handleManualReorder(
		draggedPath: string,
		toIndex: number,
		sections: { id: string; records: FileRecord[] }[],
		group: GroupMode = this.resolvedGroupMode(),
		sectionId?: string,
	) {
		const order = this.plugin.settings.manualOrder;
		const nextOrder = reorderManualOrder(
			order,
			draggedPath,
			toIndex,
			sections,
			group,
			sectionId,
		);
		if (nextOrder.join("\n") === order.join("\n")) return;
		this.manualOrderUndoStack.push([...order]);
		if (this.manualOrderUndoStack.length > 20) {
			this.manualOrderUndoStack.shift();
		}
		this.plugin.settings.manualOrder = nextOrder;
		this.buildManualOrderIndex();
		this.renderList();
		this.scheduleSaveOrder();
		this.updateManualOrderControls();
	}

	private undoManualReorder() {
		if (this.query.sort !== "manual") return;
		const previousOrder = this.manualOrderUndoStack.pop();
		if (!previousOrder) return;
		this.plugin.settings.manualOrder = previousOrder;
		this.buildManualOrderIndex();
		this.renderList();
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

	private attachLongPressMenu(element: HTMLElement, onOpen: (position: { x: number; y: number }) => void) {
		if (!Platform.isMobile) return;
		let timer: number | null = null;
		let startX = 0;
		let startY = 0;
		let didOpen = false;

		const clearTimer = () => {
			if (timer) {
				window.clearTimeout(timer);
				timer = null;
			}
		};

		element.addEventListener("touchstart", (e) => {
			const target = e.target as HTMLElement | null;
			if (target?.closest(".smart-explorer-row-drag-handle")) return;
			const touch = e.touches[0];
			if (!touch) return;
			startX = touch.clientX;
			startY = touch.clientY;
			didOpen = false;
			timer = window.setTimeout(() => {
				timer = null;
				didOpen = true;
				navigator.vibrate?.(30);
				onOpen({ x: startX, y: startY });
			}, TOUCH_LONG_PRESS_MS);
		}, { passive: true });

		element.addEventListener("touchmove", (e) => {
			if (!timer) return;
			const touch = e.touches[0];
			if (!touch) return;
			if (isTouchMovePastThreshold(startX, startY, touch.clientX, touch.clientY)) {
				clearTimer();
			}
		}, { passive: true });

		element.addEventListener("touchend", (e) => {
			clearTimer();
			if (didOpen) {
				e.preventDefault();
				e.stopPropagation();
				didOpen = false;
			}
		});

		element.addEventListener("touchcancel", () => {
			clearTimer();
			didOpen = false;
		});
	}

	private showContextMenu(e: MouseEvent, record: FileRecord) {
		this.buildFileContextMenu(record).showAtMouseEvent(e);
	}

	private buildFileContextMenu(record: FileRecord): Menu {
		const menu = new Menu();
		menu.addItem((item) =>
			item.setTitle("Open in new tab").setIcon("file-plus").onClick(() => {
				void this.openFileInLeaf(record.path, "tab");
			}),
		);
		menu.addItem((item) =>
			item.setTitle("Open to the right").setIcon("separator-vertical").onClick(() => {
				void this.openFileInLeaf(record.path, "right");
			}),
		);
		menu.addItem((item) =>
			item.setTitle("Open in new window").setIcon("picture-in-picture").onClick(() => {
				void this.openFileInLeaf(record.path, "window");
			}),
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item.setTitle("New note in same folder").setIcon("file-plus").onClick(() => {
				this.startCreateNote(record.parentPath);
			}),
		);
		menu.addItem((item) =>
			item.setTitle("Copy path").setIcon("copy").onClick(() => this.copyPath(record.path)),
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item.setTitle("Open in default app").setIcon("external-link").onClick(() => {
				void this.openInDefaultApp(record.path);
			}),
		);
		menu.addItem((item) =>
			item.setTitle("Reveal in finder").setIcon("folder-search").onClick(() => this.revealInFinder(record.path)),
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item.setTitle("Rename...").setIcon("pencil").onClick(() => {
				this.startRenameItem(record.path);
			}),
		);
		menu.addItem((item) =>
			item.setTitle("Delete").setIcon("trash").onClick(() => {
				void this.deleteItem(record.path);
			}),
		);
		return menu;
	}

	private showFolderContextMenu(e: MouseEvent, folderPath: string) {
		this.buildFolderContextMenu(folderPath).showAtMouseEvent(e);
	}

	private buildFolderContextMenu(folderPath: string): Menu {
		const menu = new Menu();
		menu.addItem((item) =>
			item.setTitle("New note").setIcon("file-plus").onClick(() => {
				this.startCreateNote(folderPath);
			}),
		);
		menu.addItem((item) =>
			item.setTitle("New folder").setIcon("folder-plus").onClick(() => {
				this.startCreateFolder(folderPath);
			}),
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item.setTitle("Collapse folders below").setIcon("folder-minus").onClick(() => {
				this.collapseFolderPath(folderPath);
			}),
		);
		menu.addItem((item) =>
			item.setTitle("Copy path").setIcon("copy").onClick(() => this.copyPath(folderPath)),
		);
		menu.addItem((item) =>
			item.setTitle("Reveal in finder").setIcon("folder-search").onClick(() => this.revealInFinder(folderPath)),
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item.setTitle("Rename...").setIcon("pencil").onClick(() => {
				this.startRenameItem(folderPath);
			}),
		);
		menu.addItem((item) =>
			item.setTitle("Delete").setIcon("trash").onClick(() => {
				void this.deleteItem(folderPath);
			}),
		);
		return menu;
	}

	private showBlankContextMenu(e: MouseEvent) {
		if (e.target !== this.listContainer) return;
		e.preventDefault();
		const menu = new Menu();
		menu.addItem((item) =>
			item.setTitle("New note").setIcon("file-plus").onClick(() => {
				this.startCreateNote();
			}),
		);
		menu.addItem((item) =>
			item.setTitle("New folder").setIcon("folder-plus").onClick(() => {
				this.startCreateFolder();
			}),
		);
		if (this.resolvedViewMode() === "tree") {
			menu.addSeparator();
			menu.addItem((item) =>
				item.setTitle(this.treeToggleTooltip()).setIcon(this.treeToggleIcon()).onClick(() => this.toggleAllFolders()),
			);
			menu.addItem((item) =>
				item.setTitle("Reveal active file").setIcon("locate-fixed").onClick(() => this.revealActiveFile()),
			);
		}
		menu.showAtMouseEvent(e);
	}

	private treeToggleIcon(): string {
		return areAllTreeFoldersExpanded(this.visibleTreeFolderPaths, this.treeExpandedPaths) ? "chevron-down" : "chevron-right";
	}

	private treeToggleTooltip(): string {
		return areAllTreeFoldersExpanded(this.visibleTreeFolderPaths, this.treeExpandedPaths) ? "Close all folders" : "Open all folders";
	}

	private updateTreeToggleControl() {
		if (!this.collapseTreeBtn) return;
		this.collapseTreeBtn.empty();
		setIcon(this.collapseTreeBtn, this.treeToggleIcon());
		this.collapseTreeBtn.setAttribute("aria-label", this.treeToggleTooltip());
		this.collapseTreeBtn.disabled = this.visibleTreeFolderPaths.length === 0;
	}

	private highlightSelected() {
		if (!this.listContainer) return;
		const rows = this.listContainer.querySelectorAll(".smart-explorer-row");
		rows.forEach((el) => {
			const row = el as HTMLElement;
			row.classList.toggle("is-selected", row.dataset.path === this.selectedPath);
		});
		const folderRows = this.listContainer.querySelectorAll<HTMLElement>(".smart-explorer-tree-folder-summary");
		folderRows.forEach((row) => {
			const details = row.parentElement;
			row.classList.toggle("is-selected", details?.dataset.path === this.selectedFolderPath);
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

function collectTreeFolderPaths(nodes: ExplorerTreeNode[]): string[] {
	return nodes.flatMap((node) => {
		if (node.type === "file") return [];
		return [node.path, ...collectTreeFolderPaths(node.children)];
	});
}

function renameNestedPath(path: string, oldPrefix: string, newPrefix: string): string {
	if (path === oldPrefix) return newPrefix;
	if (path.startsWith(`${oldPrefix}/`)) return `${newPrefix}${path.slice(oldPrefix.length)}`;
	return path;
}

type DesktopAdapter = {
	getBasePath(): string;
};

type ElectronShell = {
	openPath(path: string): Promise<string>;
	showItemInFolder(path: string): void;
};

function hasBasePath(adapter: unknown): adapter is DesktopAdapter {
	return typeof adapter === "object" && adapter !== null && "getBasePath" in adapter
		&& typeof (adapter as DesktopAdapter).getBasePath === "function";
}

function getElectronShell(): ElectronShell | null {
	const electronRequire = (window as Window & { require?: (module: string) => { shell?: ElectronShell } }).require;
	return electronRequire?.("electron").shell ?? null;
}

class ConfirmModal extends Modal {
	private message: string;
	private cta: string;
	private onSubmit: (value: boolean) => void;
	private didSubmit = false;

	constructor(app: SmartExplorerView["app"], title: string, message: string, cta: string, onSubmit: (value: boolean) => void) {
		super(app);
		this.setTitle(title);
		this.message = message;
		this.cta = cta;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("p", { text: this.message });
		new Setting(contentEl)
			.addButton((button) => {
				button.setButtonText(this.cta).setWarning().onClick(() => this.submit(true));
			})
			.addButton((button) => {
				button.setButtonText("Cancel").onClick(() => this.close());
			});
	}

	onClose() {
		this.contentEl.empty();
		if (!this.didSubmit) {
			this.onSubmit(false);
		}
	}

	private submit(value: boolean) {
		this.didSubmit = true;
		this.onSubmit(value);
		this.close();
	}
}
