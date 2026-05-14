import { Platform } from "obsidian";

export type DragSortOptions = {
	getRowHeight: () => number;
	onReorder: (draggedPath: string, toIndex: number, sectionId?: string) => void;
};

const EDGE_ZONE = 40;
const SCROLL_SPEED = 8;
const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 10;

export class DragSortManager {
	private container: HTMLElement;
	private opts: DragSortOptions;
	private indicator: HTMLElement;
	private enabled = false;
	private draggedPath: string | null = null;
	private draggedRow: HTMLElement | null = null;
	private autoScrollTimer: number | null = null;
	private rows: { el: HTMLElement; path: string; sectionId?: string }[] = [];

	// Mobile touch state
	private longPressTimer: number | null = null;
	private touchStartY = 0;
	private touchStartX = 0;
	private ghost: HTMLElement | null = null;
	private isTouchDragging = false;

	constructor(container: HTMLElement, opts: DragSortOptions) {
		this.container = container;
		this.opts = opts;
		this.indicator = createDiv({ cls: "smart-explorer-drop-indicator" });
		this.container.appendChild(this.indicator);
		this.handleDragOver = this.handleDragOver.bind(this);
		this.handleDrop = this.handleDrop.bind(this);
		this.handleDragLeave = this.handleDragLeave.bind(this);
	}

	enable() {
		if (this.enabled) return;
		this.enabled = true;
		this.container.addEventListener("dragover", this.handleDragOver);
		this.container.addEventListener("drop", this.handleDrop);
		this.container.addEventListener("dragleave", this.handleDragLeave);
	}

	disable() {
		if (!this.enabled) return;
		this.enabled = false;
		this.container.removeEventListener("dragover", this.handleDragOver);
		this.container.removeEventListener("drop", this.handleDrop);
		this.container.removeEventListener("dragleave", this.handleDragLeave);
		this.hideIndicator();
		this.rows = [];
	}

	destroy() {
		this.disable();
		this.indicator.remove();
		this.stopAutoScroll();
		this.cleanupGhost();
	}

	clearRows() {
		this.rows = [];
	}

	attachRow(row: HTMLElement, path: string, sectionId?: string) {
		this.rows.push({ el: row, path, sectionId });

		row.draggable = true;
		row.addEventListener("dragstart", (e) => {
			this.draggedPath = path;
			this.draggedRow = row;
			row.classList.add("is-dragging");
			e.dataTransfer!.effectAllowed = "move";
			e.dataTransfer!.setData("text/plain", path);
		});
		row.addEventListener("dragend", () => {
			this.cleanup();
		});

		if (Platform.isMobile) {
			this.attachTouchHandlers(row, path);
		}
	}

	reapplyDragClass() {
		if (!this.draggedPath) return;
		const row = this.container.querySelector(
			`.smart-explorer-row[data-path="${CSS.escape(this.draggedPath)}"]`,
		);
		if (row) row.classList.add("is-dragging");
	}

	private attachTouchHandlers(row: HTMLElement, path: string) {
		row.addEventListener("touchstart", (e) => {
			if (!this.enabled) return;
			const touch = e.touches[0]!;
			this.touchStartX = touch.clientX;
			this.touchStartY = touch.clientY;
			this.longPressTimer = window.setTimeout(() => {
				this.longPressTimer = null;
				this.startTouchDrag(row, path, touch.clientX, touch.clientY);
			}, LONG_PRESS_MS);
		}, { passive: true });

		row.addEventListener("touchmove", (e) => {
			if (this.longPressTimer) {
				const touch = e.touches[0]!;
				const dx = touch.clientX - this.touchStartX;
				const dy = touch.clientY - this.touchStartY;
				if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
					window.clearTimeout(this.longPressTimer);
					this.longPressTimer = null;
				}
			}
			if (this.isTouchDragging) {
				e.preventDefault();
				const touch = e.touches[0]!;
				this.moveTouchDrag(touch.clientY);
			}
		});

		row.addEventListener("touchend", () => {
			if (this.longPressTimer) {
				window.clearTimeout(this.longPressTimer);
				this.longPressTimer = null;
			}
			if (this.isTouchDragging) {
				this.finishTouchDrag();
			}
		});

		row.addEventListener("touchcancel", () => {
			if (this.longPressTimer) {
				window.clearTimeout(this.longPressTimer);
				this.longPressTimer = null;
			}
			if (this.isTouchDragging) {
				this.cancelTouchDrag();
			}
		});
	}

	private startTouchDrag(row: HTMLElement, path: string, x: number, y: number) {
		this.isTouchDragging = true;
		this.draggedPath = path;
		this.draggedRow = row;
		row.classList.add("is-dragging");
		navigator.vibrate?.(50);

		this.ghost = createDiv({ cls: "smart-explorer-drag-ghost" });
		this.ghost.setText(row.querySelector(".smart-explorer-row-name")?.textContent ?? "");
		document.body.appendChild(this.ghost);
		this.positionGhost(x, y);
		this.updateIndicatorFromClientY(y);
	}

	private moveTouchDrag(clientY: number) {
		if (this.ghost) {
			this.positionGhost(this.touchStartX, clientY);
		}
		this.updateIndicatorFromClientY(clientY);
		this.handleAutoScroll(clientY);
	}

	private finishTouchDrag() {
		const dropIndex = this.getDropIndex(this.ghost ? parseFloat(this.ghost.style.top) + 20 : 0);
		const sectionId = this.getSectionAtIndex(dropIndex);
		if (this.draggedPath != null && dropIndex >= 0) {
			this.opts.onReorder(this.draggedPath, dropIndex, sectionId);
		}
		this.cancelTouchDrag();
	}

	private cancelTouchDrag() {
		this.isTouchDragging = false;
		this.cleanup();
		this.cleanupGhost();
	}

	private positionGhost(x: number, y: number) {
		if (!this.ghost) return;
		this.ghost.style.left = `${x + 12}px`;
		this.ghost.style.top = `${y - 12}px`;
	}

	private cleanupGhost() {
		if (this.ghost) {
			this.ghost.remove();
			this.ghost = null;
		}
	}

	private handleDragOver(e: DragEvent) {
		if (!this.draggedPath) return;
		e.preventDefault();
		e.dataTransfer!.dropEffect = "move";
		this.updateIndicatorFromClientY(e.clientY);
		this.handleAutoScroll(e.clientY);
	}

	private handleDrop(e: DragEvent) {
		e.preventDefault();
		if (!this.draggedPath) return;
		const dropIndex = this.getDropIndexFromClientY(e.clientY);
		const sectionId = this.getSectionAtIndex(dropIndex);
		this.opts.onReorder(this.draggedPath, dropIndex, sectionId);
		this.cleanup();
	}

	private handleDragLeave(e: DragEvent) {
		const rect = this.container.getBoundingClientRect();
		if (
			e.clientX < rect.left || e.clientX > rect.right ||
			e.clientY < rect.top || e.clientY > rect.bottom
		) {
			this.hideIndicator();
			this.stopAutoScroll();
		}
	}

	private updateIndicatorFromClientY(clientY: number) {
		const dropIndex = this.getDropIndexFromClientY(clientY);
		this.showIndicatorAtIndex(dropIndex);
	}

	private getDropIndexFromClientY(clientY: number): number {
		const rect = this.container.getBoundingClientRect();
		const y = clientY - rect.top + this.container.scrollTop;
		return this.getDropIndex(y);
	}

	private getDropIndex(scrollY: number): number {
		const rowHeight = this.opts.getRowHeight();
		const totalRows = this.rows.length;
		if (totalRows === 0) return 0;

		// For virtual list or flat mode, use math
		if (this.isVirtualMode()) {
			const idx = Math.round(scrollY / rowHeight);
			return Math.max(0, Math.min(totalRows, idx));
		}

		// For grouped mode, find closest row boundary
		let closestIdx = 0;
		let closestDist = Infinity;
		for (let i = 0; i < this.rows.length; i++) {
			const rowTop = this.rows[i]!.el.offsetTop;
			const dist = Math.abs(scrollY - rowTop);
			if (dist < closestDist) {
				closestDist = dist;
				closestIdx = i;
			}
		}
		// Check if closer to bottom of last row
		const lastRow = this.rows[this.rows.length - 1]!.el;
		const bottomDist = Math.abs(scrollY - (lastRow.offsetTop + lastRow.offsetHeight));
		if (bottomDist < closestDist) {
			return this.rows.length;
		}
		return closestIdx;
	}

	private showIndicatorAtIndex(index: number) {
		const rowHeight = this.opts.getRowHeight();
		let top: number;

		if (this.isVirtualMode()) {
			top = index * rowHeight;
		} else if (this.rows.length === 0) {
			top = 0;
		} else if (index >= this.rows.length) {
			const lastRow = this.rows[this.rows.length - 1]!.el;
			top = lastRow.offsetTop + lastRow.offsetHeight;
		} else {
			top = this.rows[index]!.el.offsetTop;
		}

		this.indicator.style.top = `${top}px`;
		this.indicator.classList.add("is-visible");
	}

	private hideIndicator() {
		this.indicator.classList.remove("is-visible");
	}

	private getSectionAtIndex(index: number): string | undefined {
		if (index >= this.rows.length) {
			return this.rows[this.rows.length - 1]?.sectionId;
		}
		return this.rows[index]?.sectionId;
	}

	private isVirtualMode(): boolean {
		return this.container.querySelector(".smart-explorer-virtual-content") !== null;
	}

	private handleAutoScroll(clientY: number) {
		const rect = this.container.getBoundingClientRect();
		if (clientY - rect.top < EDGE_ZONE) {
			this.startAutoScroll(-SCROLL_SPEED);
		} else if (rect.bottom - clientY < EDGE_ZONE) {
			this.startAutoScroll(SCROLL_SPEED);
		} else {
			this.stopAutoScroll();
		}
	}

	private startAutoScroll(delta: number) {
		if (this.autoScrollTimer) return;
		this.autoScrollTimer = window.setInterval(() => {
			this.container.scrollTop += delta;
		}, 16);
	}

	private stopAutoScroll() {
		if (this.autoScrollTimer) {
			window.clearInterval(this.autoScrollTimer);
			this.autoScrollTimer = null;
		}
	}

	private cleanup() {
		if (this.draggedRow) {
			this.draggedRow.classList.remove("is-dragging");
		}
		this.draggedPath = null;
		this.draggedRow = null;
		this.hideIndicator();
		this.stopAutoScroll();
	}
}
