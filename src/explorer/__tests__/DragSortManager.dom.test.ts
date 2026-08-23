/** @jest-environment jsdom */

jest.mock(
	"obsidian",
	() => ({
		Platform: { isMobile: false },
	}),
	{ virtual: true },
);

import "../../test-utils/obsidianDom";
import { mockElementBox } from "../../test-utils/obsidianDom";
import { DragSortManager } from "../DragSortManager";

function createDragEvent(type: string, clientY: number): DragEvent {
	const event = new MouseEvent(type, { bubbles: true, clientY }) as DragEvent;
	Object.defineProperty(event, "dataTransfer", {
		value: {
			effectAllowed: "none",
			dropEffect: "none",
			setData: jest.fn(),
		},
	});
	return event;
}

function setupRows(count: number) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const rows: HTMLElement[] = [];
	const handles: HTMLElement[] = [];
	for (let index = 0; index < count; index++) {
		const row = document.createElement("div");
		row.className = "smart-explorer-row";
		mockElementBox(row, { top: index * 44, width: 300, height: 44 });
		const handle = document.createElement("span");
		handle.className = "smart-explorer-row-drag-handle";
		row.appendChild(handle);
		container.appendChild(row);
		rows.push(row);
		handles.push(handle);
	}
	mockElementBox(container, { top: 0, width: 300, height: count * 44 });
	return { container, rows, handles };
}

describe("DragSortManager geometry caching", () => {
	afterEach(() => {
		document.body.innerHTML = "";
		jest.restoreAllMocks();
	});

	it("does not measure row geometry during dragover events", () => {
		const { container, rows, handles } = setupRows(10);
		const onReorder = jest.fn();
		const manager = new DragSortManager(container, { onReorder });
		manager.enable();
		rows.forEach((row, index) => manager.attachRow(row, `f${index}.md`, "all", handles[index]!));

		const rowRectSpies = rows.map((row) => jest.spyOn(row, "getBoundingClientRect"));

		handles[0]!.dispatchEvent(createDragEvent("dragstart", 20));
		for (let index = 0; index < 10; index++) {
			container.dispatchEvent(createDragEvent("dragover", 20 + index * 10));
		}

		for (const spy of rowRectSpies) {
			expect(spy).not.toHaveBeenCalled();
		}

		manager.destroy();
	});

	it("recomputes the drop index after auto-scroll without row geometry calls", () => {
		jest.useFakeTimers();
		const { container, rows, handles } = setupRows(10);
		const onReorder = jest.fn();
		const manager = new DragSortManager(container, { onReorder });
		manager.enable();
		rows.forEach((row, index) => manager.attachRow(row, `f${index}.md`, "all", handles[index]!));

		const rowRectSpies = rows.map((row) => jest.spyOn(row, "getBoundingClientRect"));

		handles[0]!.dispatchEvent(createDragEvent("dragstart", 8));
		// Pointer at container y=410 would resolve to index 9 without
		// scrolling (row 9 midpoint 418); four auto-scroll ticks add 32px.
		container.dispatchEvent(createDragEvent("dragover", 410));
		jest.advanceTimersByTime(64);
		container.dispatchEvent(createDragEvent("drop", 410));

		expect(onReorder).toHaveBeenCalledTimes(1);
		expect(onReorder.mock.calls[0]![1]).toBe(10);
		for (const spy of rowRectSpies) {
			expect(spy).not.toHaveBeenCalled();
		}

		jest.useRealTimers();
		manager.destroy();
	});
});
