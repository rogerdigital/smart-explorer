import { sortRecords } from "../sorters";
import type { FileRecord, SortMode } from "../../types";

function makeRecord(overrides: Partial<FileRecord> & { path: string }): FileRecord {
	return {
		basename: overrides.path.split("/").pop()!.replace(/\.[^.]+$/, ""),
		extension: overrides.path.split(".").pop()!,
		parentPath: overrides.path.includes("/") ? overrides.path.split("/").slice(0, -1).join("/") : "",
		size: 100,
		ctime: 1700000000000,
		mtime: 1700000000000,
		isMarkdown: overrides.path.endsWith(".md"),
		isAttachment: false,
		tags: [],
		...overrides,
	};
}

const records: FileRecord[] = [
	makeRecord({ path: "b/alpha.md", mtime: 3000, ctime: 1000, size: 500 }),
	makeRecord({ path: "a/bravo.md", mtime: 2000, ctime: 3000, size: 200 }),
	makeRecord({ path: "c/charlie.md", mtime: 1000, ctime: 2000, size: 1000 }),
	makeRecord({ path: "a/alpha.md", mtime: 4000, ctime: 4000, size: 300 }),
];

describe("sortRecords", () => {
	it("sorts by name ascending", () => {
		const sorted = sortRecords(records, "name-asc");
		const names = sorted.map((r) => r.basename);
		expect(names).toEqual(["alpha", "alpha", "bravo", "charlie"]);
	});

	it("uses path as tie-breaker for same basename", () => {
		const sorted = sortRecords(records, "name-asc");
		const alphas = sorted.filter((r) => r.basename === "alpha");
		expect(alphas[0]!.path).toBe("a/alpha.md");
		expect(alphas[1]!.path).toBe("b/alpha.md");
	});

	it("sorts by name descending", () => {
		const sorted = sortRecords(records, "name-desc");
		const names = sorted.map((r) => r.basename);
		expect(names).toEqual(["charlie", "bravo", "alpha", "alpha"]);
	});

	it("sorts by modified newest first", () => {
		const sorted = sortRecords(records, "modified-new");
		expect(sorted[0]!.mtime).toBe(4000);
		expect(sorted[sorted.length - 1]!.mtime).toBe(1000);
	});

	it("sorts by modified oldest first", () => {
		const sorted = sortRecords(records, "modified-old");
		expect(sorted[0]!.mtime).toBe(1000);
		expect(sorted[sorted.length - 1]!.mtime).toBe(4000);
	});

	it("sorts by created newest first", () => {
		const sorted = sortRecords(records, "created-new");
		expect(sorted[0]!.ctime).toBe(4000);
		expect(sorted[sorted.length - 1]!.ctime).toBe(1000);
	});

	it("sorts by created oldest first", () => {
		const sorted = sortRecords(records, "created-old");
		expect(sorted[0]!.ctime).toBe(1000);
		expect(sorted[sorted.length - 1]!.ctime).toBe(4000);
	});

	it("sorts by size descending", () => {
		const sorted = sortRecords(records, "size");
		expect(sorted[0]!.size).toBe(1000);
		expect(sorted[sorted.length - 1]!.size).toBe(200);
	});

	it("sorts by extension", () => {
		const mixed = [
			makeRecord({ path: "readme.txt" }),
			makeRecord({ path: "notes.md" }),
			makeRecord({ path: "data.json" }),
		];
		const sorted = sortRecords(mixed, "extension");
		expect(sorted.map((r) => r.extension)).toEqual(["json", "md", "txt"]);
	});

	it("does not mutate original array", () => {
		const copy = [...records];
		sortRecords(records, "name-asc");
		expect(records).toEqual(copy);
	});

	it("sorts numbered filenames naturally", () => {
		const numbered = [
			makeRecord({ path: "file10.md" }),
			makeRecord({ path: "file2.md" }),
			makeRecord({ path: "file1.md" }),
			makeRecord({ path: "file20.md" }),
		];
		const sorted = sortRecords(numbered, "name-asc");
		expect(sorted.map((r) => r.basename)).toEqual(["file1", "file2", "file10", "file20"]);
	});

	it("handles empty array", () => {
		expect(sortRecords([], "name-asc")).toEqual([]);
	});

	it("handles single element", () => {
		const single = [makeRecord({ path: "only.md" })];
		expect(sortRecords(single, "name-asc")).toHaveLength(1);
	});
});
