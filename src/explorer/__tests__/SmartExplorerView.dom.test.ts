/** @jest-environment jsdom */

import { installObsidianDomShim, mockElementBox } from "../../test-utils/obsidianDom";

describe("SmartExplorerView DOM foundation", () => {
	type OptionalAnimationGlobals = typeof globalThis & {
		requestAnimationFrame?: typeof requestAnimationFrame;
		cancelAnimationFrame?: typeof cancelAnimationFrame;
	};

	it("applies current Obsidian element info fields used by the explorer", () => {
		const parent = globalThis.createDiv({ cls: "form-shell" });
		const input = parent.createEl("input", {
			type: "text",
			value: "needle",
			placeholder: "Search files...",
			title: "Search",
		}) as HTMLInputElement;
		const select = parent.createEl("select");
		const option = select.createEl("option", {
			value: "modified-new",
			text: "Modified",
		}) as HTMLOptionElement;
		const link = parent.createEl("a", {
			href: "https://example.com/docs",
			title: "Docs",
			text: "Open docs",
		}) as HTMLAnchorElement;

		expect(parent.children).toHaveLength(3);
		expect(input.type).toBe("text");
		expect(input.value).toBe("needle");
		expect(input.placeholder).toBe("Search files...");
		expect(input.title).toBe("Search");
		expect(option.value).toBe("modified-new");
		expect(option.textContent).toBe("Modified");
		expect(link.getAttribute("href")).toBe("https://example.com/docs");
		expect(link.title).toBe("Docs");
		expect(link.textContent).toBe("Open docs");
	});

	it("creates and resets Obsidian-style elements with deterministic layout", () => {
		const parent = globalThis.createDiv({ cls: "parent" });
		const child = parent.createDiv({
			cls: ["child", "", "secondary"],
			text: "Hello",
			attr: { "data-kind": "note" },
		});
		const label = child.createSpan({ text: "Label", cls: "label extra" });

		mockElementBox(child, {
			top: 44,
			left: 16,
			width: 300,
			height: 44,
		});

		expect(Array.from(child.classList)).toEqual(["child", "secondary"]);
		expect(child.textContent).toBe("HelloLabel");
		expect(child.getAttribute("data-kind")).toBe("note");
		expect(Array.from(label.classList)).toEqual(["label", "extra"]);
		expect(child.offsetTop).toBe(44);
		expect(child.getBoundingClientRect().bottom).toBe(88);
		expect(child.getBoundingClientRect().toJSON()).toEqual({
			x: 16,
			y: 44,
			top: 44,
			left: 16,
			right: 316,
			bottom: 88,
			width: 300,
			height: 44,
		});

		parent.empty();
		expect(parent.childElementCount).toBe(0);
	});

	it("defaults missing box values to zero", () => {
		const element = globalThis.createDiv({ cls: "default-box" });

		mockElementBox(element, { left: 12 });

		expect(element.offsetTop).toBe(0);
		expect(element.offsetHeight).toBe(0);
		expect(element.getBoundingClientRect().toJSON()).toEqual({
			x: 12,
			y: 0,
			top: 0,
			left: 12,
			right: 12,
			bottom: 0,
			width: 0,
			height: 0,
		});
	});

	it("shims requestAnimationFrame with async performance-based timing and cancellation", () => {
		jest.useFakeTimers();

		const animationGlobals: OptionalAnimationGlobals = globalThis;
		const originalRaf = globalThis.requestAnimationFrame;
		const originalCancelRaf = globalThis.cancelAnimationFrame;
		const performanceNowSpy = jest.spyOn(window.performance, "now").mockReturnValue(123.45);
		const callback = jest.fn();
		const cancelledCallback = jest.fn();

		try {
			Reflect.deleteProperty(animationGlobals, "requestAnimationFrame");
			Reflect.deleteProperty(animationGlobals, "cancelAnimationFrame");

			installObsidianDomShim();

			const handle = globalThis.requestAnimationFrame(callback);
			const cancelled = globalThis.requestAnimationFrame(cancelledCallback);
			globalThis.cancelAnimationFrame(cancelled);

			expect(callback).not.toHaveBeenCalled();
			expect(cancelledCallback).not.toHaveBeenCalled();

			jest.runAllTimers();

			expect(callback).toHaveBeenCalledTimes(1);
			expect(callback).toHaveBeenCalledWith(123.45);
			expect(cancelledCallback).not.toHaveBeenCalled();
			expect(handle).toBeGreaterThanOrEqual(0);
		} finally {
			performanceNowSpy.mockRestore();
			if (originalRaf) globalThis.requestAnimationFrame = originalRaf;
			else Reflect.deleteProperty(animationGlobals, "requestAnimationFrame");
			if (originalCancelRaf) globalThis.cancelAnimationFrame = originalCancelRaf;
			else Reflect.deleteProperty(animationGlobals, "cancelAnimationFrame");
			jest.useRealTimers();
		}
	});
});
