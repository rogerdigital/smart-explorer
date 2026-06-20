import { reorderManualOrder } from "../manualOrder";
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
