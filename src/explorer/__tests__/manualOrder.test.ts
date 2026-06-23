import { reconcileManualOrder, reorderManualOrder } from "../manualOrder";
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
		isAttachment: false,
		tags: [],
	};
}

describe("reorderManualOrder", () => {
	it("moves a dragged path before the flat drop target", () => {
		const sections = [
			{ id: "all", records: ["a.md", "b.md", "c.md"].map(makeRecord) },
		];

		const result = reorderManualOrder(["a.md", "b.md", "c.md"], "c.md", 1, sections, "none");

		expect(result).toEqual(["a.md", "c.md", "b.md"]);
	});

	it("keeps the dragged path in place when dropped at its own position", () => {
		// Regression: dropping on the dragged item's own slot previously sent it
		// to the end of the list because sections still contained the dragged path.
		const order = ["2026-04-15.md", "2026-04-16.md", "2026-04-17.md", "Clarify Success.md"];
		const sections = [{ id: "all", records: order.map(makeRecord) }];

		const result = reorderManualOrder([...order], "2026-04-16.md", 1, sections, "none");

		expect(result).toEqual(order);
	});

	it("moves a dragged path before its predecessor when dropped at index 0", () => {
		const order = ["2026-04-15.md", "2026-04-16.md", "2026-04-17.md", "Clarify Success.md"];
		const sections = [{ id: "all", records: order.map(makeRecord) }];

		const result = reorderManualOrder([...order], "2026-04-16.md", 0, sections, "none");

		expect(result).toEqual([
			"2026-04-16.md",
			"2026-04-15.md",
			"2026-04-17.md",
			"Clarify Success.md",
		]);
	});

	it("moves a dragged path to the end of a grouped section", () => {
		const sections = [
			{ id: "notes", records: ["notes/a.md", "notes/b.md"].map(makeRecord) },
			{ id: "assets", records: ["assets/c.png"].map(makeRecord) },
		];

		const result = reorderManualOrder(
			["notes/a.md", "notes/b.md", "assets/c.png"],
			"notes/a.md",
			2,
			sections,
			"folder",
			"notes",
		);

		expect(result).toEqual(["notes/b.md", "notes/a.md", "assets/c.png"]);
	});

	it("does not mutate the previous order snapshot", () => {
		const order = ["a.md", "b.md", "c.md"];
		const sections = [
			{ id: "all", records: order.map(makeRecord) },
		];

		reorderManualOrder(order, "a.md", 2, sections, "none");

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
});
