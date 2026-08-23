import { ItemView, Menu, Modal, Notice, Platform, Setting, setIcon, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import { SMART_EXPLORER_VIEW_TYPE } from "../constants";
import { FileIndex } from "./FileIndex";
import { VirtualList } from "./VirtualList";
import { DragSortManager } from "./DragSortManager";
import { buildSections } from "./FileTreeModel";
import { buildTree } from "./TreeModel";
import type { ExplorerTreeFolderNode, ExplorerTreeNode } from "./TreeModel";
import { reconcileManualOrder, renameManualOrderPaths, reorderManualOrder, reorderManualOrderByDelta, sameOrder } from "./manualOrder";
import { formatFileCount, formatFileModifiedDate, formatFileParent, formatVisibleFileCount } from "./fileRow";
import { formatTreeFolderTooltip } from "./treeFolderInfo";
import { resolveExplorerGroupMode, resolveExplorerViewMode, resolveManualSeedSort } from "./viewMode";
import { clearSearchAndFilters, hasActiveSearchOrFilters } from "./filterState";
import { areAllTreeFoldersExpanded, getFolderPathAndAncestors, shouldOpenTreeFolder } from "./treeExpansion";
import { appendMarkdownExtension, buildCreationPath, buildFileRenamePath, buildSiblingPath, getParentFolderPath, getPathName, resolveCreationFolder } from "./creationPath";
import { revealPathInContainer } from "./revealPath";
import { isTouchMovePastThreshold, TOUCH_LONG_PRESS_MS } from "./touchLongPress";
import { SearchRenderScheduler } from "./searchRenderScheduler";
import { resolveFocusNavigation } from "./focusNavigation";
import { getListRowHeight } from "./rowHeight";
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
	{ value: "non-markdown", text: "Non-Markdown" },
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

// Above this vault size, "Open all folders" is refused so a single toolbar
// action cannot mount every subtree at once.
const EAGER_EXPAND_FILE_LIMIT = 2000;

let smartExplorerViewDomId = 0;

type InlineEditState =
	| { kind: "create-note"; folderPath: string; value: string }
	| { kind: "create-folder"; folderPath: string; value: string }
	| { kind: "rename-file"; path: string; value: string }
	| { kind: "rename-folder"; path: string; value: string };

export class SmartExplorerView extends ItemView {
	private plugin: SmartExplorerPlugin;
	private fileIndex: FileIndex;
	private query: ExplorerQuery;
	private viewMode: ViewMode;
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
	private extensionSelect: HTMLSelectElement | null = null;
	private readonly domIdPrefix: string;
	private selectedPath: string | null = null;
	private selectedFolderPath: string | null = null;
	private activeItemPath: string | null = null;
	private treeFolderEntries: WeakMap<HTMLElement, { children: HTMLElement; node: ExplorerTreeFolderNode }> | null = new WeakMap();
	private treeExpandedPaths: Set<string> = new Set();
	private visibleTreeFolderPaths: string[] = [];
	private virtualList: VirtualList | null = null;
	private searchRenderScheduler = new SearchRenderScheduler();
	private rebuildTimeout: number | null = null;
	private dragSortManager: DragSortManager | null = null;
	private manualOrderIndex: Map<string, number> = new Map();
	private manualOrderUndoStack: string[][] = [];
	private saveOrderTimeout: number | null = null;
	private tooltipEl: HTMLElement | null = null;
	private inlineEdit: InlineEditState | null = null;
	// Reconciliation (seed + missing/deleted path sync) only runs when the
	// indexed path set changed; ordinary manual renders rebuild just the index.
	private manualOrderNeedsReconcile = true;
	// Seed sort for the current manual-sort session: the sort the user was
	// viewing right before switching into manual. Used to initialize the order
	// on first entry and as the fallback order for files added during the session.
	private manualSeedSort: Exclude<SortMode, "manual"> = "name-asc";
	private manualHintEl: HTMLElement | null = null;
	private liveRegion: HTMLElement | null = null;
	// Sections of the most recent render; the visible order used to translate
	// keyboard reorder deltas into manual-order drop indexes.
	private currentSections: { id: string; records: FileRecord[] }[] = [];

	constructor(leaf: WorkspaceLeaf, plugin: SmartExplorerPlugin) {
		super(leaf);
		this.domIdPrefix = `smart-explorer-${++smartExplorerViewDomId}`;
		this.plugin = plugin;
		this.fileIndex = new FileIndex(this.app);
		const settings = this.plugin.settings;
		this.viewMode = settings.lastViewMode;
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
		// Composite widget focus model: the container holds the single tab stop
		// and DOM focus; the active row is tracked via aria-activedescendant so
		// keyboard state survives future windowed rendering of list rows.
		this.listContainer.setAttribute("tabindex", "0");
		this.listContainer.addEventListener("keydown", (e) => this.handleListKeydown(e));
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
		this.extensionSelect = null;
		this.inlineEdit = null;
		this.manualHintEl = null;
		this.liveRegion = null;
		this.searchRenderScheduler.cancel();
		if (this.rebuildTimeout) window.clearTimeout(this.rebuildTimeout);
		// Flush a pending manual-order save before the view goes away; the
		// debounced 500ms save could otherwise be dropped, losing the user's
		// most recent reorder if they close the leaf quickly.
		if (this.saveOrderTimeout) {
			window.clearTimeout(this.saveOrderTimeout);
			this.saveOrderTimeout = null;
			await this.plugin.saveSettingsWithNotice("Could not save manual order");
			await this.plugin.flushSettings();
		}
	}

	private registerVaultEvents() {
		const events = this.plugin.app.vault;

		this.registerEvent(events.on("create", (file) => {
			if (file instanceof TFolder) {
				this.fileIndex.addFolder(file.path);
			}
			if (file instanceof TFile) {
				this.fileIndex.addFile(file);
				// New files are intentionally NOT appended to manualOrder here:
				// initializeManualOrder's reconcile places them at the correct
				// seed-sorted position, which keeps ordering consistent regardless
				// of when files are created.
			}
			this.manualOrderNeedsReconcile = true;
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
				this.fileIndex.removeFolder(file.path);
				this.collapseFolderPath(file.path);
			}
			this.manualOrderNeedsReconcile = true;
			this.scheduleRebuild();
		}));

		this.registerEvent(events.on("rename", (file, oldPath) => {
			this.manualOrderNeedsReconcile = true;
			if (file instanceof TFile) {
				this.fileIndex.removeFile(oldPath);
				this.fileIndex.addFile(file);
				if (this.selectedPath === oldPath) {
					this.selectedPath = file.path;
				}
				this.updateManualOrderAfterRename(oldPath, file.path);
			} else if (file instanceof TFolder) {
				this.updateFolderPathState(oldPath, file.path);
				this.fileIndex.renameFolder(oldPath, file.path);
				this.updateManualOrderAfterRename(oldPath, file.path);
			}
			this.scheduleRebuild();
		}));

		this.registerEvent(events.on("modify", (file) => {
			if (file instanceof TFile) {
				this.fileIndex.addFile(file);
				this.scheduleRebuild();
			}
		}));

		// Keep the selection highlight in sync when files open elsewhere, but
		// never auto-reveal: switching tabs must not scroll or expand folders.
		this.registerEvent(this.plugin.app.workspace.on("file-open", (file) => {
			this.selectedPath = file instanceof TFile ? file.path : null;
			this.selectedFolderPath = null;
			this.highlightSelected();
		}));
	}

	private scheduleRebuild() {
		if (this.rebuildTimeout) window.clearTimeout(this.rebuildTimeout);
		this.rebuildTimeout = window.setTimeout(() => {
			this.renderList();
		}, 300);
	}

	refreshSettingsProjection() {
		this.renderList();
	}

	resetManualOrderState() {
		this.manualOrderUndoStack = [];
		this.manualOrderNeedsReconcile = true;
		this.updateManualOrderControls();
		this.renderList();
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
			this.plugin.settings.lastViewMode = this.viewMode;
			void this.plugin.saveSettingsWithNotice("Could not save view mode");
			this.renderList();
		});
		this.createSelect(row1, COMPACT_SORT_OPTIONS, "smart-explorer-sort", "Sort order", (v) => {
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
		searchToggleBtn.setAttribute("aria-controls", `${this.domIdPrefix}-search-panel`);
		searchToggleBtn.addEventListener("mouseenter", (e) => this.showTooltip(searchToggleBtn.getAttribute("aria-label") ?? "Search", e));
		searchToggleBtn.addEventListener("mouseleave", () => this.hideTooltip());
		searchToggleBtn.addEventListener("click", () => {
			this.toggleSearchRow();
		});

		const filterToggleBtn = row1.createEl("button", {
			cls: "smart-explorer-filter-toggle",
		});
		this.filterToggleBtn = filterToggleBtn;
		setIcon(filterToggleBtn, "sliders-horizontal");
		filterToggleBtn.setAttribute("aria-controls", `${this.domIdPrefix}-filter-panel`);

		const row2 = toolbar.createDiv({ cls: "smart-explorer-toolbar-row smart-explorer-search-row is-collapsed" });
		this.searchRow = row2;
		row2.id = `${this.domIdPrefix}-search-panel`;
		const searchInput = row2.createEl("input", {
			type: "text",
			placeholder: "Search files...",
			cls: "smart-explorer-search",
		});
		this.searchInput = searchInput;
		searchInput.value = this.query.searchText;
		searchInput.addEventListener("input", () => {
			this.query.searchText = searchInput.value;
			this.searchRenderScheduler.schedule(() => this.renderList());
		});

		const filterRow = toolbar.createDiv({ cls: "smart-explorer-toolbar-row smart-explorer-toolbar-filters" });
		this.filterRow = filterRow;
		filterRow.id = `${this.domIdPrefix}-filter-panel`;
		filterRow.classList.add("is-collapsed");
		filterToggleBtn.addEventListener("mouseenter", (e) => this.showTooltip(filterToggleBtn.getAttribute("aria-label") ?? "Filters", e));
		filterToggleBtn.addEventListener("mouseleave", () => this.hideTooltip());
		filterToggleBtn.addEventListener("click", () => {
			filterRow.classList.toggle("is-collapsed");
			this.updateDisclosureButton(filterToggleBtn, filterRow, "filters", this.hasActiveFilterControls());
		});

		this.createSelect(filterRow, GROUP_OPTIONS, "smart-explorer-group", "Group files", (v) => {
			if (this.query.sort === "manual") return;
			this.query.group = v as GroupMode;
			this.renderList();
		}, this.query.group);
		this.groupSelect = filterRow.querySelector(".smart-explorer-group");

		this.createSelect(filterRow, FILE_KIND_OPTIONS, "smart-explorer-kind", "File kind", (v) => {
			this.query.fileKind = v as FileKind;
			this.renderList();
		}, this.query.fileKind);

		this.extensionSelect = this.createSelect(
			filterRow,
			[{ value: "", text: "All extensions" }],
			"smart-explorer-extension",
			"File extension",
			(v) => {
				this.query.extension = v || null;
				this.renderList();
			},
			this.query.extension ?? "",
		);

		this.createSelect(
			filterRow,
			MODIFIED_RANGE_OPTIONS.map((o) => ({ value: o.value, text: o.text })),
			"smart-explorer-modified",
			"Modified date",
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

		this.liveRegion = toolbar.createDiv({ cls: "smart-explorer-sr-only" });
		this.liveRegion.setAttribute("aria-live", "polite");
		this.liveRegion.setAttribute("aria-atomic", "true");

		this.updateViewModeControl();
		this.updateManualOrderControls();
		this.updateDisclosureButton(searchToggleBtn, row2, "search", this.query.searchText.trim().length > 0);
		this.updateDisclosureButton(filterToggleBtn, filterRow, "filters", this.hasActiveFilterControls());
		this.registerKeyboardShortcuts(container);
	}

	private createSelect(
		parent: HTMLElement,
		options: { value: string; text: string }[],
		cls: string,
		ariaLabel: string,
		onChange: (value: string) => void,
		value?: string,
	) {
		const select = parent.createEl("select", { cls });
		select.setAttribute("aria-label", ariaLabel);
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
		this.searchRenderScheduler.cancel();
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
		this.updateDisclosureButton(
			this.searchToggleBtn,
			this.searchRow,
			"search",
			this.query.searchText.trim().length > 0,
		);
		if (shouldOpen) {
			this.searchInput?.focus();
			this.searchInput?.select();
		}
	}

	private updateDisclosureButton(
		button: HTMLButtonElement,
		panel: HTMLElement,
		label: string,
		active: boolean,
	) {
		const expanded = !panel.classList.contains("is-collapsed");
		button.setAttribute("aria-expanded", String(expanded));
		button.setAttribute("aria-label", `${expanded ? "Hide" : "Show"} ${label}`);
		button.classList.toggle("is-active", expanded || active);
	}

	private syncExtensionOptions(records: FileRecord[]) {
		const extensions = Array.from(new Set(records.map((record) => record.extension).filter(Boolean)))
			.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
		if (this.query.extension !== null && !extensions.includes(this.query.extension)) {
			this.query.extension = null;
		}
		if (!this.extensionSelect) return;
		this.extensionSelect.empty();
		this.extensionSelect.createEl("option", { value: "", text: "All extensions" });
		for (const extension of extensions) {
			this.extensionSelect.createEl("option", { value: extension, text: `.${extension}` });
		}
		this.extensionSelect.value = this.query.extension ?? "";
		if (this.filterToggleBtn && this.filterRow) {
			this.updateDisclosureButton(
				this.filterToggleBtn,
				this.filterRow,
				"filters",
				this.hasActiveFilterControls(),
			);
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
					this.searchRenderScheduler.cancel();
					this.query.searchText = "";
					if (this.searchInput) this.searchInput.value = "";
					if (this.searchToggleBtn && this.searchRow) {
						this.updateDisclosureButton(this.searchToggleBtn, this.searchRow, "search", false);
					}
					this.renderList();
					return;
				}
				if (this.searchRow && !this.searchRow.classList.contains("is-collapsed")) {
					e.preventDefault();
					this.searchRow.classList.add("is-collapsed");
					if (this.searchToggleBtn) {
						this.updateDisclosureButton(
							this.searchToggleBtn,
							this.searchRow,
							"search",
							this.query.searchText.trim().length > 0,
						);
					}
					return;
				}
				if (this.filterRow && !this.filterRow.classList.contains("is-collapsed")) {
					e.preventDefault();
					this.filterRow.classList.add("is-collapsed");
					if (this.filterToggleBtn) {
						this.updateDisclosureButton(
							this.filterToggleBtn,
							this.filterRow,
							"filters",
							this.hasActiveFilterControls(),
						);
					}
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
				this.manualHintEl.setText(`Manual order, starting from ${seedLabel}. Drag rows or press Alt+Up/Down to reorder.`);
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

		const mode = this.resolvedViewMode();
		this.listContainer.setAttribute("role", mode === "tree" ? "tree" : "listbox");
		this.listContainer.setAttribute("aria-label", mode === "tree" ? "Vault files" : "Vault file list");

		const hiddenExts = new Set(this.plugin.settings.hiddenExtensions);

		const allRecords = this.fileIndex.getAll();
		let records = allRecords;
		if (hiddenExts.size > 0) {
			records = allRecords.filter((record) => !hiddenExts.has(record.extension));
		}
		this.syncExtensionOptions(records);

		this.listContainer.classList.toggle("is-tree-view", mode === "tree");
		this.listContainer.classList.toggle("is-list-view", mode === "list");
		const hasFilters = hasActiveSearchOrFilters(this.query);
		const hasInlineCreate = this.hasInlineCreate();
		let folderPaths: string[] = [];
		if (mode === "tree") {
			folderPaths = hasFilters
				? getInlineCreateFolderPaths(this.inlineEdit)
				: this.fileIndex.getFolderPaths();
		}

		if (allRecords.length === 0 && (mode === "list" || folderPaths.length === 0) && !hasInlineCreate) {
			this.listContainer.createDiv({
				cls: "smart-explorer-empty",
				text: "No files in vault.",
				attr: { role: "status" },
			});
			this.finalizeRender(0, 0);
			return;
		}
		if (records.length === 0 && allRecords.length > 0 && !hasInlineCreate) {
			this.listContainer.createDiv({
				cls: "smart-explorer-empty",
				text: "All files are hidden by extension settings.",
				attr: { role: "status" },
			});
			this.finalizeRender(0, records.length);
			return;
		}

		if (this.query.sort === "manual") {
			if (this.manualOrderNeedsReconcile) {
				this.initializeManualOrder(allRecords);
				this.manualOrderNeedsReconcile = false;
			} else {
				this.buildManualOrderIndex();
			}
		}

		const effectiveQuery = { ...this.query, group: this.resolvedGroupMode() };

		// Tree mode filters and sorts exactly once through buildTree; the
		// sections pipeline below only serves list mode.
		if (mode === "tree") {
			this.currentSections = [];
			this.syncSelectedPathFromActiveFile();
			const tree = buildTree(records, effectiveQuery, this.manualOrderIndex, folderPaths);
			const displayed = tree.fileCount;
			if (displayed === 0 && folderPaths.length === 0 && hasFilters && !hasInlineCreate) {
				this.renderNoMatches();
				this.finalizeRender(displayed, records.length);
				return;
			}
			const visibleTreeFolderPaths = collectTreeFolderPaths(tree.children);
			const rootCreateEl = this.createInlineCreateElement("", 0);
			if (rootCreateEl) {
				this.listContainer.appendChild(rootCreateEl);
			}
			for (const node of tree.children) {
				this.listContainer.appendChild(this.createTreeNodeElement(node));
			}
			this.finalizeRender(displayed, records.length, visibleTreeFolderPaths);
			return;
		}

		const sections = buildSections(records, effectiveQuery, this.manualOrderIndex);
		this.currentSections = sections;
		const displayed = sections.reduce((n, s) => n + s.records.length, 0);

		if (displayed === 0 && hasFilters && !hasInlineCreate) {
			this.renderNoMatches();
			this.finalizeRender(displayed, records.length);
			return;
		}

		const rootCreateEl = this.createInlineCreateElement("", 0, true);
		if (rootCreateEl) {
			this.listContainer.appendChild(rootCreateEl);
		}

		const isManualSort = this.query.sort === "manual";
		const useVirtual = !isManualSort && effectiveQuery.group === "none" && VirtualList.shouldVirtualize(displayed);

		// The drag manager must exist before manual rows are created so rows
		// can register themselves directly at creation time.
		if (isManualSort && this.listContainer) {
			this.dragSortManager = new DragSortManager(this.listContainer, {
				onReorder: (path, toIndex) => this.handleManualReorder(path, toIndex, sections),
			});
			this.dragSortManager.enable();
		}

		if (useVirtual) {
			const virtualRecords = sections[0]!.records;
			this.virtualList = new VirtualList(this.listContainer, getListRowHeight(Platform.isMobile));
			this.virtualList.setItems(virtualRecords.map((record) => ({
				key: record.path,
				render: () => this.createRowElement(record),
			})));
			this.virtualList.setPinnedKey(this.activeItemPath);
		} else {
			for (const section of sections) {
				if (section.records.length === 0) continue;
				if (effectiveQuery.group !== "none") {
					const header = this.listContainer.createDiv({ cls: "smart-explorer-section-header" });
					header.setText(`${section.title} (${section.records.length})`);
				}
				for (const record of section.records) {
					this.listContainer.appendChild(this.createRowElement(record, section.id));
				}
			}
		}

		this.finalizeRender(displayed, records.length);
	}

	private finalizeRender(displayed: number, total: number, visibleTreeFolderPaths: string[] = []) {
		this.visibleTreeFolderPaths = visibleTreeFolderPaths;
		this.updateFileCount(displayed, total);
		this.updateViewModeControl();
		this.updateManualOrderControls();
		this.restoreActiveItem();
	}

	private getItemDomId(path: string): string {
		return `${this.domIdPrefix}-item-${encodeURIComponent(path)}`;
	}

	// Windowed lists navigate over logical keys: only the visible window plus
	// the pinned active row exist in the DOM, so indexes come from the
	// VirtualList instead of the rendered elements.
	private handleVirtualKeydown(e: KeyboardEvent): void {
		const keys = this.virtualList!.getKeys();
		if (keys.length === 0) return;
		const current = this.activeItemPath ? keys.indexOf(this.activeItemPath) : -1;
		const action = resolveFocusNavigation({
			key: e.key,
			current,
			count: keys.length,
			folderExpanded: null,
		});
		if (action.type === "none") return;
		e.preventDefault();
		if (action.type === "focus") {
			this.setActiveItem(keys[action.index] ?? null, true);
		} else if (action.type === "activate" && this.activeItemPath) {
			this.selectedPath = this.activeItemPath;
			this.selectedFolderPath = null;
			void this.openFile(this.activeItemPath);
			this.highlightSelected();
		}
	}

	// All currently mounted rows and folder summaries that participate in
	// keyboard navigation, in visual order. Rows inside closed folders are
	// excluded because they are not rendered visually.
	private getVisibleNavigationItems(): HTMLElement[] {
		if (!this.listContainer) return [];
		return Array.from(this.listContainer.querySelectorAll<HTMLElement>(
			'[role="option"], [role="treeitem"]',
		)).filter((element) => {
			// Rows inside a closed folder are not rendered visually; the
			// folder's own summary stays navigable.
			const closedFolder = element.closest("details:not([open])");
			return !closedFolder || closedFolder.querySelector(":scope > summary") === element;
		});
	}

	// Points aria-activedescendant at the mounted active item, or removes it
	// when the active item is not currently mounted (e.g. filtered out).
	private setActiveItem(path: string | null, scrollIntoView = false): void {
		this.activeItemPath = path;
		if (this.virtualList) {
			this.virtualList.setPinnedKey(path);
			if (scrollIntoView && path) {
				this.virtualList.scrollToIndex(this.virtualList.indexOfKey(path));
			}
		}
		if (!this.listContainer) return;
		// Query within the container (not activeDocument) so the model also
		// works before the view is attached to the live document.
		const mounted = path
			? this.listContainer.querySelector<HTMLElement>(`[id="${this.getItemDomId(path)}"]`)
			: null;
		if (mounted) {
			this.listContainer.setAttribute("aria-activedescendant", mounted.id);
		} else {
			this.listContainer.removeAttribute("aria-activedescendant");
		}
		for (const item of this.getVisibleNavigationItems()) {
			item.classList.toggle("is-keyboard-active", item.dataset.navPath === path);
		}
	}

	// After a full re-render, keep the active item stable when it is still
	// visible; otherwise prefer the selected row, then the first visible item.
	private restoreActiveItem(): void {
		const items = this.getVisibleNavigationItems();
		if (items.length === 0) {
			this.setActiveItem(null);
			return;
		}
		const paths = items.map((item) => item.dataset.navPath ?? null);
		if (this.activeItemPath && paths.includes(this.activeItemPath)) return;
		const next = this.selectedPath && paths.includes(this.selectedPath)
			? this.selectedPath
			: paths[0] ?? null;
		this.setActiveItem(next);
	}

	private handleListKeydown(e: KeyboardEvent): void {
		if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
			if (this.query.sort === "manual" && this.activeItemPath) {
				e.preventDefault();
				this.handleKeyboardManualReorder(this.activeItemPath, e.key === "ArrowUp" ? -1 : 1);
			}
			return;
		}
		if (this.virtualList) {
			this.handleVirtualKeydown(e);
			return;
		}
		const items = this.getVisibleNavigationItems();
		if (items.length === 0) return;
		const activeElement = items.find((item) => item.dataset.navPath === this.activeItemPath) ?? null;
		const current = activeElement ? items.indexOf(activeElement) : -1;
		const folderExpanded = activeElement?.tagName === "SUMMARY"
			? (activeElement.parentElement as HTMLDetailsElement | null)?.open ?? null
			: null;
		const action = resolveFocusNavigation({
			key: e.key,
			current,
			count: items.length,
			folderExpanded,
		});
		if (action.type === "none") return;
		e.preventDefault();
		switch (action.type) {
			case "focus": {
				const target = items[action.index]!;
				this.setActiveItem(target.dataset.navPath ?? null);
				target.scrollIntoView?.({ block: "nearest" });
				break;
			}
			case "expand":
			case "collapse":
				if (activeElement?.tagName === "SUMMARY") {
					this.setFolderOpen(activeElement, action.type === "expand");
				}
				break;
			case "activate":
				if (activeElement?.tagName === "SUMMARY") {
					this.selectedFolderPath = activeElement.dataset.navPath ?? null;
					this.selectedPath = null;
					const details = activeElement.parentElement as HTMLDetailsElement | null;
					this.setFolderOpen(activeElement, !(details?.open ?? false));
					this.highlightSelected();
				} else if (activeElement?.dataset.navPath) {
					this.selectedPath = activeElement.dataset.navPath;
					this.selectedFolderPath = null;
					void this.openFile(this.selectedPath);
					this.highlightSelected();
				}
				break;
		}
	}

	private renderNoMatches() {
		if (!this.listContainer) return;
		const empty = this.listContainer.createDiv({ cls: "smart-explorer-empty", attr: { role: "status" } });
		empty.createSpan({ text: "No files match the current search or filters." });
		const clearBtn = empty.createEl("button", { text: "Clear filters", cls: "smart-explorer-clear-btn" });
		clearBtn.addEventListener("click", () => {
			this.clearSearchAndFilters();
		});
	}

	private hasInlineCreate(): boolean {
		return this.inlineEdit?.kind === "create-note" || this.inlineEdit?.kind === "create-folder";
	}

	private createInlineCreateElement(folderPath: string, depth: number, force = false): HTMLElement | null {
		if (!this.inlineEdit || (this.inlineEdit.kind !== "create-note" && this.inlineEdit.kind !== "create-folder")) {
			return null;
		}
		if (!force && this.inlineEdit.folderPath !== folderPath) return null;
		const row = createDiv({ cls: "smart-explorer-row smart-explorer-inline-edit-row" });
		// No role/id/data-nav-path: the inline input carries its own semantics
		// and must not join the container's composite keyboard navigation.
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
		// Reject path separators and parent-directory segments so a typed (or
		// pasted) name can't silently create deeply nested paths or escape the
		// target folder.
		if (value.includes("/") || value.includes("\\") || value.includes("..")) {
			new Notice("Name cannot contain path separators or \"..\".");
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
			const summary = details.createEl("summary", { cls: "smart-explorer-tree-folder-summary" });
			summary.setAttribute("role", "treeitem");
			summary.setAttribute("tabindex", "-1");
			summary.setAttribute("aria-level", String(node.depth + 1));
			summary.setAttribute("aria-expanded", String(details.open));
			summary.id = this.getItemDomId(node.path);
			summary.dataset.path = node.path;
			summary.dataset.navPath = node.path;
			summary.classList.toggle("is-selected", this.selectedFolderPath === node.path);
			summary.style.setProperty("--smart-explorer-depth", String(node.depth));
			summary.createSpan({ cls: "smart-explorer-tree-disclosure", text: "›" });
			if (this.inlineEdit?.kind === "rename-folder" && this.inlineEdit.path === node.path) {
				summary.appendChild(this.createInlineEditInput(this.inlineEdit.value, "Folder name"));
			} else {
				summary.createSpan({ cls: "smart-explorer-tree-name", text: node.name });
			}
			summary.createSpan({ cls: "smart-explorer-tree-count", text: formatFileCount(node.fileCount) });
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
			children.setAttribute("role", "group");
			this.treeFolderEntries?.set(summary, { children, node });
			// The native toggle event fires asynchronously; keyboard open/close
			// syncs the mounted subtree immediately through setFolderOpen, and
			// this listener re-syncs click and programmatic toggles.
			details.addEventListener("toggle", () => {
				if (details.open) {
					this.treeExpandedPaths.add(node.path);
					this.mountTreeChildren(children, node);
				} else {
					this.treeExpandedPaths.delete(node.path);
					// Closing a folder unmounts its descendants from keyboard
					// navigation; move the active item up to the folder itself
					// before the subtree leaves the DOM.
					if (this.activeItemPath !== null && this.activeItemPath !== node.path
						&& this.activeItemPath.startsWith(`${node.path}/`)) {
						this.setActiveItem(node.path);
					}
					this.unmountTreeChildren(children);
				}
				summary.setAttribute("aria-expanded", String(details.open));
				this.updateTreeToggleControl();
			});
			if (details.open) {
				this.mountTreeChildren(children, node);
			}
			return details;
		}

		const row = this.createRowElement(node.record);
		row.classList.add("smart-explorer-tree-file");
		row.style.setProperty("--smart-explorer-depth", String(node.depth));
		row.setAttribute("aria-level", String(node.depth + 1));
		return row;
	}

	private mountTreeChildren(
		container: HTMLElement,
		node: ExplorerTreeFolderNode,
	): void {
		if (container.dataset.mountedPath === node.path) return;
		container.empty();
		const inlineCreateEl = this.createInlineCreateElement(node.path, node.depth + 1);
		if (inlineCreateEl) {
			container.appendChild(inlineCreateEl);
		}
		for (const child of node.children) {
			container.appendChild(this.createTreeNodeElement(child));
		}
		container.dataset.mountedPath = node.path;
	}

	private unmountTreeChildren(container: HTMLElement): void {
		container.empty();
		delete container.dataset.mountedPath;
	}

	// Keeps a closed folder's subtree out of the DOM; when open, mounts it
	// synchronously so keyboard navigation can enter it in the same keystroke.
	private setFolderOpen(summary: HTMLElement, open: boolean): void {
		const details = summary.parentElement as HTMLDetailsElement | null;
		if (!details) return;
		const entry = this.treeFolderEntries?.get(summary) ?? null;
		if (open) {
			this.treeExpandedPaths.add(entry?.node.path ?? summary.dataset.navPath ?? "");
		} else {
			this.treeExpandedPaths.delete(entry?.node.path ?? summary.dataset.navPath ?? "");
		}
		details.open = open;
		if (entry) {
			if (open) {
				this.mountTreeChildren(entry.children, entry.node);
			} else {
				if (this.activeItemPath !== null && entry.node.children.length > 0
					&& this.activeItemPath !== entry.node.path
					&& this.activeItemPath.startsWith(`${entry.node.path}/`)) {
					this.setActiveItem(entry.node.path);
				}
				this.unmountTreeChildren(entry.children);
			}
		}
		summary.setAttribute("aria-expanded", String(open));
		this.updateTreeToggleControl();
	}

	private createRowElement(record: FileRecord, sectionId?: string): HTMLElement {
		const row = createDiv({ cls: "smart-explorer-row" });
		row.dataset.path = record.path;
		row.id = this.getItemDomId(record.path);
		row.dataset.navPath = record.path;
		row.setAttribute("role", this.resolvedViewMode() === "tree" ? "treeitem" : "option");
		const isSelected = record.path === this.selectedPath;
		if (isSelected) {
			row.classList.add("is-selected");
		}
		row.setAttribute("aria-selected", String(isSelected));
		if (this.query.sort === "manual") {
			const handle = row.createSpan({ cls: "smart-explorer-row-drag-handle" });
			setIcon(handle, "grip-vertical");
			handle.setAttribute("aria-label", "Drag to reorder");
			handle.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
			});
			this.dragSortManager?.attachRow(row, record.path, sectionId, handle);
		}
		const identity = row.createSpan({ cls: "smart-explorer-row-identity" });
		if (this.inlineEdit?.kind === "rename-file" && this.inlineEdit.path === record.path) {
			identity.appendChild(this.createInlineEditInput(this.inlineEdit.value, "File name"));
		} else {
			identity.createSpan({ cls: "smart-explorer-row-name", text: record.basename });
		}
		const meta = identity.createSpan({ cls: "smart-explorer-row-meta" });
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
		this.fileCountEl.setText(formatVisibleFileCount(displayed, total));
		const hasFilters = hasActiveSearchOrFilters(this.query);
		this.clearFiltersBtn?.classList.toggle("is-hidden", !hasFilters);
		if (this.searchToggleBtn && this.searchRow) {
			this.updateDisclosureButton(
				this.searchToggleBtn,
				this.searchRow,
				"search",
				this.query.searchText.trim().length > 0,
			);
		}
		if (this.filterToggleBtn && this.filterRow) {
			this.updateDisclosureButton(
				this.filterToggleBtn,
				this.filterRow,
				"filters",
				this.hasActiveFilterControls(),
			);
		}
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
		for (const path of getFolderPathAndAncestors(folderPath)) {
			this.treeExpandedPaths.add(path);
		}
	}

	private toggleAllFolders() {
		if (areAllTreeFoldersExpanded(this.visibleTreeFolderPaths, this.treeExpandedPaths)) {
			this.treeExpandedPaths.clear();
			this.selectedFolderPath = null;
		} else {
			// Eagerly expanding a large vault would mount every subtree and
			// defeat lazy tree rendering; require per-folder expansion instead.
			if (this.fileIndex.size > EAGER_EXPAND_FILE_LIMIT) {
				new Notice(`Open folders individually in vaults over ${EAGER_EXPAND_FILE_LIMIT.toLocaleString()} files.`);
				return;
			}
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

	private updateManualOrderAfterRename(oldPath: string, newPath: string) {
		const order = this.plugin.settings.manualOrder;
		const nextOrder = renameManualOrderPaths(order, oldPath, newPath);
		if (nextOrder === order) return;

		this.plugin.settings.manualOrder = nextOrder;
		this.buildManualOrderIndex();
		this.scheduleSaveOrder();
	}

	revealActiveFile() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		this.searchRenderScheduler.cancel();
		this.query = clearSearchAndFilters(this.query);
		if (this.query.sort === "manual") {
			this.query.sort = this.manualSeedSort;
		}
		this.selectedPath = activeFile.path;
		this.selectedFolderPath = null;
		this.expandFolderAncestors(getParentFolderPath(activeFile.path));
		this.viewMode = "tree";
		this.rebuildView();

		if (
			this.listContainer &&
			!revealPathInContainer(this.listContainer, activeFile.path)
		) {
			new Notice("Active file is hidden by the explorer settings.");
		}
	}

	private async openFileInLeaf(path: string, leafType: "tab" | "right" | "window") {
		await this.runAction(async () => {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) return;
			const leaf = leafType === "right"
				? this.app.workspace.getLeaf("split", "vertical")
				: leafType === "window"
					? this.app.workspace.openPopoutLeaf()
					: this.app.workspace.getLeaf("tab");
			await leaf.openFile(file);
		}, "Could not open file");
	}

	// Single error boundary for user-triggered async actions: failures turn
	// into a Notice instead of an unhandled rejection.
	private async runAction(action: () => Promise<void>, failure: string): Promise<void> {
		try {
			await action();
		} catch (error) {
			new Notice(`${failure}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private copyPath(path: string) {
		void this.runAction(async () => {
			await navigator.clipboard.writeText(path);
			new Notice("Copied path.");
		}, "Could not copy path");
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

	private initializeManualOrder(allRecords: FileRecord[]) {
		const order = this.plugin.settings.manualOrder;
		const seeded = buildSections(allRecords, {
			...this.query,
			searchText: "",
			group: "none",
			extension: null,
			fileKind: "all",
			modifiedWithinDays: null,
			sort: this.manualSeedSort,
		});
		const fallbackOrder = seeded[0]?.records.map((record) => record.path) ?? [];
		const reconciled = reconcileManualOrder(order, allRecords, fallbackOrder);
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
	) {
		const nextOrder = reorderManualOrder(
			this.plugin.settings.manualOrder,
			draggedPath,
			toIndex,
			sections,
		);
		this.applyManualReorder(nextOrder);
	}

	private handleKeyboardManualReorder(draggedPath: string, delta: -1 | 1): void {
		const nextOrder = reorderManualOrderByDelta(
			this.plugin.settings.manualOrder,
			draggedPath,
			delta,
			this.currentSections,
		);
		if (!this.applyManualReorder(nextOrder)) return;
		// The render inside applyManualReorder rebuilt the DOM; point the
		// container's active descendant back at the moved row so repeated
		// Alt+Arrow presses keep operating on the same file.
		const moved = this.listContainer
			?.querySelector<HTMLElement>(`[id="${this.getItemDomId(draggedPath)}"]`) ?? null;
		moved?.scrollIntoView?.({ block: "nearest" });
		this.setActiveItem(draggedPath);
		const visible = this.currentSections.flatMap((section) => section.records.map((record) => record.path));
		const position = visible.indexOf(draggedPath);
		if (position >= 0) {
			const name = draggedPath.split("/").pop() ?? draggedPath;
			this.announce(`Moved ${name} to position ${position + 1} of ${visible.length}.`);
		}
	}

	// Commits a new manual order: undo stack, index rebuild, re-render, and
	// debounced persistence. Returns false when the order did not change.
	private applyManualReorder(nextOrder: string[]): boolean {
		const order = this.plugin.settings.manualOrder;
		if (sameOrder(nextOrder, order)) return false;
		this.manualOrderUndoStack.push([...order]);
		if (this.manualOrderUndoStack.length > 20) {
			this.manualOrderUndoStack.shift();
		}
		this.plugin.settings.manualOrder = nextOrder;
		this.buildManualOrderIndex();
		this.renderList();
		this.scheduleSaveOrder();
		this.updateManualOrderControls();
		return true;
	}

	private announce(text: string): void {
		if (!this.liveRegion) return;
		this.liveRegion.setText(text);
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
			void this.plugin.saveSettingsWithNotice("Could not save manual order");
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
			const selected = row.dataset.path === this.selectedPath;
			row.classList.toggle("is-selected", selected);
			row.setAttribute("aria-selected", String(selected));
		});
		const folderRows = this.listContainer.querySelectorAll<HTMLElement>(".smart-explorer-tree-folder-summary");
		folderRows.forEach((row) => {
			const selected = row.dataset.path === this.selectedFolderPath;
			row.classList.toggle("is-selected", selected);
			row.setAttribute("aria-selected", String(selected));
		});
	}

	private async openFile(path: string) {
		await this.runAction(async () => {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) return;
			let leaf = this.app.workspace.getLeaf(false);
			if (leaf.view?.getViewType() === SMART_EXPLORER_VIEW_TYPE) {
				leaf = this.app.workspace.getLeaf("tab");
			}
			await leaf.openFile(file);
		}, "Could not open file");
	}
}

function getInlineCreateFolderPaths(state: InlineEditState | null): string[] {
	if (!state || (state.kind !== "create-note" && state.kind !== "create-folder")) return [];
	return getFolderPathAndAncestors(state.folderPath);
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
				button
					.setButtonText(this.cta)
					.setCta()
					.onClick(() => this.submit(true));
				button.buttonEl.addClass("mod-destructive", "mod-warning");
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
