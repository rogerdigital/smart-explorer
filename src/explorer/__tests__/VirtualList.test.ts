/** @jest-environment jsdom */

import "../../test-utils/obsidianDom";
import { VirtualList, type VirtualListItem } from "../VirtualList";

function makeItems(count: number): VirtualListItem[] {
	return Array.from({ length: count }, (_, index) => ({
		key: `k${index}`,
		render: () => {
			const row = document.createElement("div");
			row.className = "test-row";
			row.textContent = `row ${index}`;
			return row;
		},
	}));
}

function makeContainer(height: number): HTMLElement {
	const container = document.createElement("div");
	document.body.appendChild(container);
	Object.defineProperty(container, "clientHeight", { value: height, configurable: true });
	return container;
}

describe("VirtualList windowed rendering", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
		document.body.innerHTML = "";
	});

	it("virtualizes only above the threshold", () => {
		expect(VirtualList.shouldVirtualize(200)).toBe(false);
		expect(VirtualList.shouldVirtualize(201)).toBe(true);
	});

	it("bounds mounted rows, reuses nodes, and exposes collection metadata", () => {
		const container = makeContainer(440);
		const list = new VirtualList(container, 44);
		list.setItems(makeItems(10000));

		expect(container.querySelectorAll(".test-row").length).toBeLessThanOrEqual(30);

		container.tabIndex = 0;
		container.focus();
		list.setPinnedKey("k0");
		container.scrollTop = 44;
		container.dispatchEvent(new Event("scroll"));
		jest.runOnlyPendingTimers();
		const reused = container.querySelector('[data-key="k1"]');
		expect(reused).not.toBeNull();
		container.scrollTop = 88;
		container.dispatchEvent(new Event("scroll"));
		jest.runOnlyPendingTimers();
		expect(container.querySelector('[data-key="k1"]')).toBe(reused);

		container.scrollTop = 4400;
		container.dispatchEvent(new Event("scroll"));
		jest.runOnlyPendingTimers();
		expect(document.activeElement).toBe(container);
		expect(container.querySelector('[data-key="k0"]')).not.toBeNull();
		expect(container.querySelectorAll(".test-row").length).toBeLessThanOrEqual(31);
		const row100 = container.querySelector('[data-key="k100"]');
		expect(row100?.getAttribute("aria-posinset")).toBe("101");
		expect(row100?.getAttribute("aria-setsize")).toBe("10000");

		list.destroy();
	});

	it("positions rows absolutely within a sized content element", () => {
		const container = makeContainer(440);
		const list = new VirtualList(container, 44);
		list.setItems(makeItems(300));

		const content = container.querySelector<HTMLElement>(".smart-explorer-virtual-content")!;
		expect(content.style.height).toBe(`${300 * 44}px`);
		const row = container.querySelector<HTMLElement>('[data-key="k5"]')!;
		expect(row.style.transform).toBe(`translateY(${5 * 44}px)`);

		list.destroy();
	});

	it("scrolls to a logical index and mounts the final item", () => {
		const container = makeContainer(440);
		const list = new VirtualList(container, 44);
		list.setItems(makeItems(10000));

		list.scrollToIndex(9999);

		expect(container.scrollTop).toBeGreaterThan(0);
		expect(container.querySelector('[data-key="k9999"]')).not.toBeNull();

		list.destroy();
	});

	it("reports logical keys and indexes", () => {
		const container = makeContainer(440);
		const list = new VirtualList(container, 44);
		list.setItems(makeItems(5));

		expect(list.getKeys()).toEqual(["k0", "k1", "k2", "k3", "k4"]);
		expect(list.indexOfKey("k3")).toBe(3);
		expect(list.indexOfKey("missing")).toBe(-1);

		list.destroy();
	});

	it("destroys the scroll listener, pending frame, and mounted nodes", () => {
		const container = makeContainer(440);
		const list = new VirtualList(container, 44);
		list.setItems(makeItems(1000));

		container.scrollTop = 400;
		container.dispatchEvent(new Event("scroll"));
		list.destroy();

		expect(container.querySelector(".smart-explorer-virtual-content")).toBeNull();
		expect(container.querySelectorAll(".test-row")).toHaveLength(0);
		container.scrollTop = 800;
		container.dispatchEvent(new Event("scroll"));
		jest.runOnlyPendingTimers();
		expect(container.querySelectorAll(".test-row")).toHaveLength(0);
	});

	it("keeps a pinned key mounted even outside the visible window", () => {
		const container = makeContainer(440);
		const list = new VirtualList(container, 44);
		list.setItems(makeItems(1000));

		list.setPinnedKey("k500");
		container.scrollTop = 0;
		container.dispatchEvent(new Event("scroll"));
		jest.runOnlyPendingTimers();

		expect(container.querySelector('[data-key="k500"]')).not.toBeNull();

		list.destroy();
	});
});
