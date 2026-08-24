import {
	reconcileManualOrder,
	renameManualOrderPaths,
	reorderManualOrder,
	reorderManualOrderByDelta,
	sameOrder,
} from "../manualOrder";
import type { FileRecord } from "../../types";

function makeRecord(path: string): FileRecord {
	return {
		path,
		basename: path.split("/").pop()!.replace(/\.[^.]+$/, ""),
		extension: path.split(".").pop()!,
		parentPath: path.includes("/") ? path.split("/").slice(0, -1).join("/") : "",
		size: 100,
		ctime: 1700000000000,
		mtime: 1700000000000,
		isMarkdown: path.endsWith(".md"),
	};
}

describe("reorderManualOrder", () => {
	it("moves a dragged path before the flat drop target", () => {
		const sections = [
			{ id: "all", records: ["a.md", "b.md", "c.md"].map(makeRecord) },
		];

		const result = reorderManualOrder(["a.md", "b.md", "c.md"], "c.md", 1, sections);

		expect(result).toEqual(["a.md", "c.md", "b.md"]);
	});

	it("keeps the dragged path in place when dropped at its own position", () => {
		// Regression: dropping on the dragged item's own slot previously sent it
		// to the end of the list because sections still contained the dragged path.
		const order = ["2026-04-15.md", "2026-04-16.md", "2026-04-17.md", "Clarify Success.md"];
		const sections = [{ id: "all", records: order.map(makeRecord) }];

		const result = reorderManualOrder([...order], "2026-04-16.md", 1, sections);

		expect(result).toEqual(order);
	});

	it("moves a dragged path before its predecessor when dropped at index 0", () => {
		const order = ["2026-04-15.md", "2026-04-16.md", "2026-04-17.md", "Clarify Success.md"];
		const sections = [{ id: "all", records: order.map(makeRecord) }];

		const result = reorderManualOrder([...order], "2026-04-16.md", 0, sections);

		expect(result).toEqual([
			"2026-04-16.md",
			"2026-04-15.md",
			"2026-04-17.md",
			"Clarify Success.md",
		]);
	});

	it("maps a filtered drop target back into the global order", () => {
		const order = ["a.md", "b.md", "c.md", "d.md"];
		const sections = [{
			id: "all",
			records: ["c.md", "d.md"].map(makeRecord),
		}];

		const result = reorderManualOrder(order, "d.md", 0, sections);

		expect(result).toEqual(["a.md", "b.md", "d.md", "c.md"]);
	});

	it("moves a visible item after the last visible anchor without moving trailing hidden files", () => {
		const order = ["a.md", "hidden-1.md", "b.md", "hidden-2.md"];
		const sections = [{
			id: "all",
			records: ["a.md", "b.md"].map(makeRecord),
		}];

		const result = reorderManualOrder(order, "a.md", 2, sections);

		expect(result).toEqual(["hidden-1.md", "b.md", "a.md", "hidden-2.md"]);
	});

	it("does not move the only visible item", () => {
		const order = ["hidden-a.md", "visible.md", "hidden-b.md"];
		const sections = [{
			id: "all",
			records: [makeRecord("visible.md")],
		}];

		const result = reorderManualOrder(order, "visible.md", 1, sections);

		expect(result).toEqual(order);
	});

	it("does not mutate the previous order snapshot", () => {
		const order = ["a.md", "b.md", "c.md"];
		const sections = [
			{ id: "all", records: order.map(makeRecord) },
		];

		reorderManualOrder(order, "a.md", 2, sections);

		expect(order).toEqual(["a.md", "b.md", "c.md"]);
	});
});

describe("reconcileManualOrder", () => {
	it("appends new vault files missing from the saved order", () => {
		const order = ["2026-04-15.md", "2026-04-16.md", "Clarify Success.md"];
		const records = [...order.map(makeRecord), makeRecord("2026-04-20.md")];

		const result = reconcileManualOrder(order, records);

		expect(result).toEqual([
			"2026-04-15.md",
			"2026-04-16.md",
			"Clarify Success.md",
			"2026-04-20.md",
		]);
	});

	it("prunes paths no longer present in the vault", () => {
		const order = ["a.md", "deleted.md", "b.md"];
		const records = ["a.md", "b.md"].map(makeRecord);

		const result = reconcileManualOrder(order, records);

		expect(result).toEqual(["a.md", "b.md"]);
	});

	it("returns the same array reference when already in sync", () => {
		const order = ["a.md", "b.md"];
		const records = order.map(makeRecord);

		const result = reconcileManualOrder(order, records);

		expect(result).toBe(order);
	});

	it("seeds an empty order from the given fallback order", () => {
		const records = ["a.md", "b.md"].map(makeRecord);
		const fallback = ["b.md", "a.md"];

		const result = reconcileManualOrder([], records, fallback);

		expect(result).toEqual(["b.md", "a.md"]);
	});

	it("keeps every known file when the fallback order is partial", () => {
		const records = ["a.md", "b.md", "c.md"].map(makeRecord);

		const result = reconcileManualOrder([], records, ["b.md"]);

		expect(result).toEqual(["b.md", "a.md", "c.md"]);
	});

	it("deduplicates saved paths while preserving the first occurrence", () => {
		const records = ["a.md", "b.md"].map(makeRecord);

		const result = reconcileManualOrder(
			["a.md", "a.md", "b.md"],
			records,
			["b.md", "a.md"],
		);

		expect(result).toEqual(["a.md", "b.md"]);
	});
});

describe("renameManualOrderPaths", () => {
	it("rewrites a renamed file path without changing its position", () => {
		expect(renameManualOrderPaths(
			["a.md", "folder/old.md", "b.md"],
			"folder/old.md",
			"folder/new.md",
		)).toEqual(["a.md", "folder/new.md", "b.md"]);
	});

	it("rewrites every child path after a folder rename", () => {
		expect(renameManualOrderPaths(
			["a.md", "old/x.md", "old/nested/y.md", "b.md"],
			"old",
			"new",
		)).toEqual(["a.md", "new/x.md", "new/nested/y.md", "b.md"]);
	});

	it("returns the same reference when a rename does not affect the order", () => {
		const order = ["a.md", "b.md"];

		expect(renameManualOrderPaths(order, "missing", "new")).toBe(order);
	});
});

describe("reorderManualOrderByDelta", () => {
	it("moves a visible manual item one position by keyboard", () => {
		const sections = [{ id: "all", records: ["a.md", "b.md", "c.md"].map(makeRecord) }];

		expect(reorderManualOrderByDelta(["a.md", "b.md", "c.md"], "b.md", -1, sections))
			.toEqual(["b.md", "a.md", "c.md"]);
		expect(reorderManualOrderByDelta(["a.md", "b.md", "c.md"], "b.md", 1, sections))
			.toEqual(["a.md", "c.md", "b.md"]);
	});

	it("returns the same order when the move would leave the list", () => {
		const sections = [{ id: "all", records: ["a.md", "b.md"].map(makeRecord) }];

		const order = ["a.md", "b.md"];
		expect(reorderManualOrderByDelta(order, "a.md", -1, sections)).toBe(order);
		expect(reorderManualOrderByDelta(order, "b.md", 1, sections)).toBe(order);
	});

	it("returns the same order for a path hidden from the visible sections", () => {
		const sections = [{ id: "all", records: ["a.md"].map(makeRecord) }];
		const order = ["a.md", "b.md"];

		expect(reorderManualOrderByDelta(order, "b.md", 1, sections)).toBe(order);
	});

	it("moves across section boundaries through the flattened visible order", () => {
		const sections = [
			{ id: "first", records: ["a.md"].map(makeRecord) },
			{ id: "second", records: ["b.md"].map(makeRecord) },
		];

		expect(reorderManualOrderByDelta(["a.md", "b.md"], "b.md", -1, sections))
			.toEqual(["b.md", "a.md"]);
	});
});

describe("sameOrder", () => {
	it("compares arrays element-wise", () => {
		expect(sameOrder(["a.md"], ["a.md"])).toBe(true);
		expect(sameOrder(["a.md", "b.md"], ["b.md", "a.md"])).toBe(false);
		expect(sameOrder(["a.md"], ["a.md", "b.md"])).toBe(false);
	});
});
