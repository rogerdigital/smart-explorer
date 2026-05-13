import { Platform } from "obsidian";

const ROW_HEIGHT_DESKTOP = 28;
const ROW_HEIGHT_MOBILE = 44;
const BUFFER_ROWS = 10;
const VIRTUAL_THRESHOLD = 200;

export class VirtualList {
	private container: HTMLElement;
	private rowHeight: number;
	private items: (() => HTMLElement)[] = [];
	private spacerTop: HTMLElement;
	private spacerBottom: HTMLElement;
	private content: HTMLElement;
	private scrollHandler: () => void;
	private lastStart = -1;
	private lastEnd = -1;

	constructor(container: HTMLElement) {
		this.container = container;
		this.rowHeight = Platform.isMobile ? ROW_HEIGHT_MOBILE : ROW_HEIGHT_DESKTOP;
		this.spacerTop = container.createDiv({ cls: "smart-explorer-virtual-spacer" });
		this.content = container.createDiv({ cls: "smart-explorer-virtual-content" });
		this.spacerBottom = container.createDiv({ cls: "smart-explorer-virtual-spacer" });
		this.scrollHandler = () => this.render();
		this.container.addEventListener("scroll", this.scrollHandler);
	}

	setItems(factories: (() => HTMLElement)[]) {
		this.items = factories;
		this.lastStart = -1;
		this.lastEnd = -1;
		this.render();
	}

	destroy() {
		this.container.removeEventListener("scroll", this.scrollHandler);
	}

	private render() {
		const scrollTop = this.container.scrollTop;
		const viewHeight = this.container.clientHeight;
		const totalItems = this.items.length;
		const totalHeight = totalItems * this.rowHeight;

		let start = Math.floor(scrollTop / this.rowHeight) - BUFFER_ROWS;
		let end = Math.ceil((scrollTop + viewHeight) / this.rowHeight) + BUFFER_ROWS;
		start = Math.max(0, start);
		end = Math.min(totalItems, end);

		if (start === this.lastStart && end === this.lastEnd) return;
		this.lastStart = start;
		this.lastEnd = end;

		this.spacerTop.style.height = `${start * this.rowHeight}px`;
		this.spacerBottom.style.height = `${Math.max(0, totalHeight - end * this.rowHeight)}px`;

		this.content.empty();
		for (let i = start; i < end; i++) {
			const el = this.items[i]!();
			this.content.appendChild(el);
		}
	}

	static shouldVirtualize(count: number): boolean {
		return count > VIRTUAL_THRESHOLD;
	}
}
