import { applyFilters } from "../filters";
import type { ExplorerQuery, FileRecord } from "../../types";

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

const baseQuery: ExplorerQuery = {
	searchText: "",
	sort: "name-asc",
	group: "none",
	extension: null,
	markdownOnly: false,
	attachmentsOnly: false,
	modifiedWithinDays: null,
};

const records: FileRecord[] = [
	makeRecord({ path: "notes/project.md", mtime: Date.now() - 1000 }),
	makeRecord({ path: "assets/photo.png", mtime: Date.now() - 100000, isAttachment: true, isMarkdown: false }),
	makeRecord({ path: "readme.md", mtime: Date.now() - 200000 }),
	makeRecord({ path: "data.json", mtime: Date.now() - 999999999, isMarkdown: false }),
];

describe("applyFilters", () => {
	it("returns all records with empty query", () => {
		const result = applyFilters(records, baseQuery);
		expect(result).toHaveLength(4);
	});

	it("filters by search text matching basename", () => {
		const result = applyFilters(records, { ...baseQuery, searchText: "project" });
		expect(result).toHaveLength(1);
		expect(result[0]!.basename).toBe("project");
	});

	it("filters by search text matching path", () => {
		const result = applyFilters(records, { ...baseQuery, searchText: "assets/" });
		expect(result).toHaveLength(1);
	});

	it("is case-insensitive", () => {
		const result = applyFilters(records, { ...baseQuery, searchText: "README" });
		expect(result).toHaveLength(1);
	});

	it("filters by extension", () => {
		const result = applyFilters(records, { ...baseQuery, extension: "md" });
		expect(result).toHaveLength(2);
		expect(result.every((r) => r.extension === "md")).toBe(true);
	});

	it("filters markdown only", () => {
		const result = applyFilters(records, { ...baseQuery, markdownOnly: true });
		expect(result).toHaveLength(2);
		expect(result.every((r) => r.isMarkdown)).toBe(true);
	});

	it("filters attachments only", () => {
		const result = applyFilters(records, { ...baseQuery, attachmentsOnly: true });
		expect(result).toHaveLength(1);
		expect(result[0]!.path).toBe("assets/photo.png");
	});

	it("filters by modified within days", () => {
		const result = applyFilters(records, { ...baseQuery, modifiedWithinDays: 1 });
		expect(result.length).toBeLessThan(4);
		expect(result.every((r) => r.mtime >= Date.now() - 1 * 24 * 60 * 60 * 1000)).toBe(true);
	});

	it("combines multiple filters", () => {
		const result = applyFilters(records, {
			...baseQuery,
			searchText: "project",
			markdownOnly: true,
		});
		expect(result).toHaveLength(1);
		expect(result[0]!.path).toBe("notes/project.md");
	});

	it("returns empty when filters exclude everything", () => {
		const result = applyFilters(records, {
			...baseQuery,
			searchText: "nonexistent",
		});
		expect(result).toHaveLength(0);
	});
});
