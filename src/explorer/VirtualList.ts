const BUFFER_ROWS = 10;
// Lists above this size switch to windowed rendering so row DOM stays bounded.
const VIRTUAL_THRESHOLD = 200;

export type VirtualListItem = {
	key: string;
	render: () => HTMLElement;
};

export class VirtualList {
	private container: HTMLElement;
	private rowHeight: number;
	private items: VirtualListItem[] = [];
	private keyIndex = new Map<string, number>();
	private mounted = new Map<string, HTMLElement>();
	private content: HTMLElement;
	private scrollHandler: () => void;
	private frame: number | null = null;
	private pinnedKey: string | null = null;

	constructor(container: HTMLElement, rowHeight: number) {
		this.container = container;
		this.rowHeight = rowHeight;
		this.content = container.createDiv({ cls: "smart-explorer-virtual-content" });
		this.scrollHandler = () => this.scheduleRender();
		this.container.addEventListener("scroll", this.scrollHandler);
	}

	setItems(items: VirtualListItem[]) {
		this.items = items;
		this.keyIndex = new Map(items.map((item, index) => [item.key, index]));
		this.mounted.forEach((element) => element.remove());
		this.mounted.clear();
		this.renderWindow();
	}

	getKeys(): string[] {
		return this.items.map((item) => item.key);
	}

	indexOfKey(key: string): number {
		return this.keyIndex.get(key) ?? -1;
	}

	// The active row stays mounted even when scrolled outside the window, so
	// the container's aria-activedescendant always references a live node.
	setPinnedKey(key: string | null): void {
		if (this.pinnedKey === key) return;
		this.pinnedKey = key;
		this.renderWindow();
	}

	scrollTo(top: number): void {
		this.container.scrollTop = top;
		this.renderWindow();
	}

	// Scrolls only when the index is outside the *visible* viewport (not the
	// buffered render window) so normal navigation does not fight the
	// preserved scroll position while never drifting off-screen.
	scrollToIndex(index: number): void {
		if (index < 0 || index >= this.items.length) return;
		const scrollTop = this.container.scrollTop;
		const viewHeight = this.container.clientHeight;
		const firstVisible = Math.floor(scrollTop / this.rowHeight);
		const lastVisible = Math.ceil((scrollTop + viewHeight) / this.rowHeight);
		if (index >= firstVisible && index < lastVisible) return;
		const target = index * this.rowHeight;
		// Keep some context above the target instead of aligning to its top
		// edge when navigating upwards.
		this.container.scrollTop = index > firstVisible ? target : Math.max(0, target - viewHeight + this.rowHeight);
		this.renderWindow();
	}

	destroy() {
		if (this.frame !== null) {
			window.cancelAnimationFrame(this.frame);
			this.frame = null;
		}
		this.container.removeEventListener("scroll", this.scrollHandler);
		this.mounted.forEach((element) => element.remove());
		this.mounted.clear();
		this.content.remove();
	}

	static shouldVirtualize(count: number): boolean {
		return count > VIRTUAL_THRESHOLD;
	}

	private scheduleRender = () => {
		if (this.frame !== null) return;
		this.frame = window.requestAnimationFrame(() => {
			this.frame = null;
			this.renderWindow();
		});
	};

	private currentWindow(): [number, number] {
		const scrollTop = this.container.scrollTop;
		const viewHeight = this.container.clientHeight;
		const total = this.items.length;
		const start = Math.max(0, Math.floor(scrollTop / this.rowHeight) - BUFFER_ROWS);
		const end = Math.min(total, Math.ceil((scrollTop + viewHeight) / this.rowHeight) + BUFFER_ROWS);
		return [start, end];
	}

	private renderWindow() {
		if (this.items.length === 0) {
			this.mounted.forEach((element) => element.remove());
			this.mounted.clear();
			// Dynamic by design: content height tracks the item count.
		// eslint-disable-next-line obsidianmd/no-static-styles-assignment
		this.content.style.setProperty("height", "0px");
			return;
		}
		const total = this.items.length;
		const [start, end] = this.currentWindow();
		const wanted = new Map<string, number>();
		for (let i = start; i < end; i++) {
			wanted.set(this.items[i]!.key, i);
		}
		const pinnedIndex = this.pinnedKey !== null ? this.keyIndex.get(this.pinnedKey) : undefined;
		if (this.pinnedKey !== null && pinnedIndex !== undefined) {
			wanted.set(this.pinnedKey, pinnedIndex);
		}
		for (const [key, element] of this.mounted) {
			if (!wanted.has(key)) {
				element.remove();
				this.mounted.delete(key);
			}
		}
		this.content.style.setProperty("height", `${total * this.rowHeight}px`);
		const ordered = Array.from(wanted.entries()).sort((a, b) => a[1] - b[1]);
		for (const [key, index] of ordered) {
			let element = this.mounted.get(key);
			if (!element) {
				element = this.items[index]!.render();
				element.dataset.key = key;
				element.classList.add("smart-explorer-virtual-row");
				this.mounted.set(key, element);
			}
			element.style.setProperty("transform", `translateY(${index * this.rowHeight}px)`);
			element.setAttribute("aria-posinset", String(index + 1));
			element.setAttribute("aria-setsize", String(total));
			// appendChild also moves an existing node, keeping DOM order aligned
			// with logical row order after scrolling back toward the start.
			this.content.appendChild(element);
		}
	}
}
