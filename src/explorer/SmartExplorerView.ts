import { ItemView, Menu, Platform, TFile, WorkspaceLeaf } from "obsidian";
import { SMART_EXPLORER_VIEW_TYPE } from "../constants";
import { FileIndex } from "./FileIndex";
import { VirtualList } from "./VirtualList";
import { DragSortManager } from "./DragSortManager";
import { buildSections } from "./FileTreeModel";
import { getPreviewData, formatFileSize, formatDate, extractFirstParagraph } from "./preview";
import type { PreviewData } from "./preview";
import type { ExplorerQuery, FileRecord, SortMode, GroupMode } from "../types";

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
	private listContainer: HTMLElement | null = null;
	private previewPanel: HTMLElement | null = null;
	private extSelect: HTMLSelectElement | null = null;
	private fileCountEl: HTMLElement | null = null;
	private selectedPath: string | null = null;
	private previewEnabled = true;
	private previewGeneration = 0;
	private virtualList: VirtualList | null = null;
	private searchTimeout: number | null = null;
	private rebuildTimeout: number | null = null;
	private dragSortManager: DragSortManager | null = null;
	private manualOrderIndex: Map<string, number> = new Map();
	private saveOrderTimeout: number | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: SmartExplorerPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.fileIndex = new FileIndex(this.app);
		const settings = this.plugin.settings;
		this.previewEnabled = Platform.isMobile ? settings.mobilePreviewEnabled : settings.previewEnabled;
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

		this.renderToolbar(container);

		const body = container.createDiv({ cls: "smart-explorer-body" });
		this.listContainer = body.createDiv({ cls: "smart-explorer-list" });
		this.createResizeHandle(body);
		this.previewPanel = body.createDiv({ cls: "smart-explorer-preview" });

		this.showIndexing();
		await new Promise((r) => window.setTimeout(r, 0));
		this.fileIndex.build();
		this.renderList();
		this.renderPreview();

		this.registerVaultEvents();
	}

	private showIndexing() {
		if (!this.listContainer) return;
		this.listContainer.empty();
		const el = this.listContainer.createDiv({ cls: "smart-explorer-indexing" });
		el.createSpan({ text: "Indexing files..." });
	}

	async onClose() {
		if (this.virtualList) {
			this.virtualList.destroy();
			this.virtualList = null;
		}
		if (this.dragSortManager) {
			this.dragSortManager.destroy();
			this.dragSortManager = null;
		}
		this.listContainer = null;
		this.previewPanel = null;
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
			if (this.searchTimeout) window.clearTimeout(this.searchTimeout);
			this.searchTimeout = window.setTimeout(() => {
				this.query.searchText = searchInput.value;
				this.renderList();
			}, 200);
		});

		const row1 = toolbar.createDiv({ cls: "smart-explorer-toolbar-row" });
		this.createSelect(row1, SORT_OPTIONS, "smart-explorer-sort", (v) => { this.query.sort = v as SortMode; this.renderList(); });
		this.createSelect(row1, GROUP_OPTIONS, "smart-explorer-group", (v) => { this.query.group = v as GroupMode; this.renderList(); });

		const extOptions: { value: string; text: string }[] = [{ value: "", text: "All types" }];
		this.extSelect = this.createSelect(row1, extOptions, "smart-explorer-ext", (v) => {
			this.query.extension = v || null;
			this.renderList();
		});
		this.populateExtensions(this.extSelect);

		const row2 = toolbar.createDiv({ cls: "smart-explorer-toolbar-row smart-explorer-toolbar-filters" });

		if (Platform.isMobile) {
			row2.classList.add("is-collapsed");
			const filterToggleBtn = row1.createEl("button", {
				cls: "smart-explorer-filter-toggle",
				text: "⚙",
			});
			filterToggleBtn.addEventListener("click", () => {
				row2.classList.toggle("is-collapsed");
				filterToggleBtn.classList.toggle("is-active", !row2.classList.contains("is-collapsed"));
			});
		}

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
		previewBtn.classList.toggle("is-active", this.previewEnabled);

		this.fileCountEl = toolbar.createDiv({ cls: "smart-explorer-file-count" });

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
		const mdBtn = row.querySelector(".smart-explorer-toggle-md");
		const attachBtn = row.querySelector(".smart-explorer-toggle-attach");
		if (mdBtn) mdBtn.classList.toggle("is-active", this.query.markdownOnly);
		if (attachBtn) attachBtn.classList.toggle("is-active", this.query.attachmentsOnly);
	}

	private populateExtensions(select: HTMLSelectElement) {
		const currentValue = select.value;
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

		const displayed = sections.reduce((n, s) => n + s.records.length, 0);
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

			// Attach drag handlers to rendered rows
			for (const section of sections) {
				for (const record of section.records) {
					const row = this.listContainer.querySelector(
						`.smart-explorer-row[data-path="${CSS.escape(record.path)}"]`,
					) as HTMLElement | null;
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
	}

	private createRowElement(record: FileRecord): HTMLElement {
		const row = createDiv({ cls: "smart-explorer-row" });
		row.dataset.path = record.path;
		row.setAttribute("tabindex", "0");
		row.setAttribute("role", "option");
		if (record.path === this.selectedPath) {
			row.classList.add("is-selected");
		}
		row.createSpan({ cls: "smart-explorer-row-name", text: record.basename });
		if (record.extension) {
			row.createSpan({ cls: "smart-explorer-row-ext", text: `.${record.extension}` });
		}
		const activate = () => {
			if (Platform.isMobile && this.previewEnabled) {
				if (this.selectedPath === record.path) {
					void this.openFile(record.path);
				} else {
					this.selectedPath = record.path;
					this.highlightSelected();
					this.renderPreview();
				}
			} else {
				this.selectedPath = record.path;
				void this.openFile(record.path);
				this.highlightSelected();
				this.renderPreview();
			}
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
		const fromGlobal = order.indexOf(draggedPath);
		if (fromGlobal >= 0) {
			order.splice(fromGlobal, 1);
		}

		// Compute global insertion position
		let targetGlobal: number;
		if (sectionId && this.query.group !== "none") {
			const section = sections.find((s) => s.id === sectionId);
			if (section && section.records.length > 0) {
				const clampedIdx = Math.min(toIndex, section.records.length);
				if (clampedIdx >= section.records.length) {
					const lastPath = section.records[section.records.length - 1]!.path;
					const lastGlobal = order.indexOf(lastPath);
					targetGlobal = lastGlobal >= 0 ? lastGlobal + 1 : order.length;
				} else {
					const targetPath = section.records[clampedIdx]!.path;
					const targetPos = order.indexOf(targetPath);
					targetGlobal = targetPos >= 0 ? targetPos : order.length;
				}
			} else {
				targetGlobal = order.length;
			}
		} else {
			// Flat mode: toIndex maps directly
			const allRecords = sections.flatMap((s) => s.records);
			const clampedIdx = Math.min(toIndex, allRecords.length);
			if (clampedIdx >= allRecords.length) {
				targetGlobal = order.length;
			} else {
				const targetPath = allRecords[clampedIdx]!.path;
				const targetPos = order.indexOf(targetPath);
				targetGlobal = targetPos >= 0 ? targetPos : order.length;
			}
		}

		order.splice(targetGlobal, 0, draggedPath);
		this.buildManualOrderIndex();
		this.renderList();
		this.scheduleSaveOrder();
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
		menu.addSeparator();
		menu.addItem((item) =>
			item.setTitle("Delete").setIcon("trash").onClick(() => {
				const file = this.app.vault.getAbstractFileByPath(record.path);
				if (file instanceof TFile) {
					void this.app.fileManager.trashFile(file);
				}
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
		const gen = ++this.previewGeneration;
		void this.renderPreviewContent(data, record, gen);
	}

	private async renderPreviewContent(data: PreviewData, record: FileRecord, gen: number) {
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

			let paragraph: string | undefined;
			const file = this.app.vault.getAbstractFileByPath(record.path);
			if (file instanceof TFile) {
				try {
					const content = await this.app.vault.cachedRead(file);
					if (gen !== this.previewGeneration) return;
					paragraph = extractFirstParagraph(content);
				} catch {
					// file too large or unreadable, skip paragraph
				}
			}
			if (paragraph) {
				this.previewPanel.createDiv({
					cls: "smart-explorer-preview-paragraph",
					text: paragraph,
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
			if (file instanceof TFile) {
				img.src = this.app.vault.getResourcePath(file);
			}
			img.alt = record.basename;
		} else {
			const meta = this.previewPanel.createDiv({ cls: "smart-explorer-preview-meta" });
			meta.createDiv({ text: `Type: ${data.extension.toUpperCase()}` });
			meta.createDiv({ text: `Size: ${formatFileSize(data.size)}` });
			meta.createDiv({ text: `Modified: ${formatDate(data.mtime)}` });
		}
	}

	private createResizeHandle(body: HTMLElement) {
		const handle = body.createDiv({ cls: "smart-explorer-resize-handle" });
		let startY = 0;
		let startHeight = 0;

		const onMove = (e: MouseEvent | TouchEvent) => {
			const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0]!.clientY;
			const delta = clientY - startY;
			if (this.previewPanel) {
				this.previewPanel.style.height = `${Math.max(60, startHeight - delta)}px`;
			}
		};

		const onEnd = () => {
			activeWindow.document.removeEventListener("mousemove", onMove);
			activeWindow.document.removeEventListener("mouseup", onEnd);
			activeWindow.document.removeEventListener("touchmove", onMove);
			activeWindow.document.removeEventListener("touchend", onEnd);
		};

		const onStart = (e: MouseEvent | TouchEvent) => {
			startY = e instanceof MouseEvent ? e.clientY : e.touches[0]!.clientY;
			startHeight = this.previewPanel?.clientHeight ?? 200;
			activeWindow.document.addEventListener("mousemove", onMove);
			activeWindow.document.addEventListener("mouseup", onEnd);
			activeWindow.document.addEventListener("touchmove", onMove);
			activeWindow.document.addEventListener("touchend", onEnd);
		};

		handle.addEventListener("mousedown", onStart);
		handle.addEventListener("touchstart", onStart);
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
