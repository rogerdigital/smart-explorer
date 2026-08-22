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
		...overrides,
	};
}

const baseQuery: ExplorerQuery = {
	searchText: "",
	sort: "name-asc",
	group: "none",
	extension: null,
	fileKind: "all",
	modifiedWithinDays: null,
};

const records: FileRecord[] = [
	makeRecord({ path: "notes/project.md", mtime: Date.now() - 1000 }),
	makeRecord({ path: "assets/photo.png", mtime: Date.now() - 100000, isMarkdown: false }),
	makeRecord({ path: "assets/screenshot.jpeg", mtime: Date.now() - 120000, isMarkdown: false }),
	makeRecord({ path: "readme.md", mtime: Date.now() - 200000 }),
	makeRecord({ path: "data.json", mtime: Date.now() - 999999999, isMarkdown: false }),
	makeRecord({ path: "boards/plan.canvas", mtime: Date.now() - 300000, isMarkdown: false }),
	makeRecord({ path: "tables/data.base", mtime: Date.now() - 400000, isMarkdown: false }),
	makeRecord({ path: "docs/document.docx", mtime: Date.now() - 500000, isMarkdown: false }),
	makeRecord({ path: "sheets/data.csv", mtime: Date.now() - 600000, isMarkdown: false }),
];

describe("applyFilters", () => {
	it("returns all records with empty query", () => {
		const result = applyFilters(records, baseQuery);
		expect(result).toHaveLength(records.length);
	});

	it("filters by search text matching basename", () => {
		const result = applyFilters(records, { ...baseQuery, searchText: "project" });
		expect(result).toHaveLength(1);
		expect(result[0]!.basename).toBe("project");
	});

	it("filters by search text matching path", () => {
		const result = applyFilters(records, { ...baseQuery, searchText: "assets/" });
		expect(result).toHaveLength(2);
	});

	it("is case-insensitive", () => {
		const result = applyFilters(records, { ...baseQuery, searchText: "README" });
		expect(result).toHaveLength(1);
	});

	it("matches ASCII I independently of the system locale", () => {
		const localeLower = jest.spyOn(String.prototype, "toLocaleLowerCase")
			.mockImplementation(() => {
				throw new Error("locale-sensitive case folding must not be used");
			});

		try {
			const result = applyFilters(
				[makeRecord({ path: "Inbox.md" })],
				{ ...baseQuery, searchText: "i" },
			);
			expect(result.map((record) => record.path)).toEqual(["Inbox.md"]);
			expect(localeLower).not.toHaveBeenCalled();
		} finally {
			localeLower.mockRestore();
		}
	});

	it("ignores whitespace-only search text", () => {
		const result = applyFilters(records, { ...baseQuery, searchText: "   \n\t " });
		expect(result).toEqual(records);
	});

	it("filters by extension", () => {
		const result = applyFilters(records, { ...baseQuery, extension: "md" });
		expect(result).toHaveLength(2);
		expect(result.every((r) => r.extension === "md")).toBe(true);
	});

	it("filters markdown files by file kind", () => {
		const result = applyFilters(records, { ...baseQuery, fileKind: "markdown" });
		expect(result).toHaveLength(2);
		expect(result.every((r) => r.isMarkdown)).toBe(true);
	});

	it("filters non-markdown files by file kind", () => {
		const result = applyFilters(records, { ...baseQuery, fileKind: "non-markdown" });
		expect(result.map((r) => r.path)).toEqual([
			"assets/photo.png",
			"assets/screenshot.jpeg",
			"data.json",
			"boards/plan.canvas",
			"tables/data.base",
			"docs/document.docx",
			"sheets/data.csv",
		]);
	});

	it("includes canvas, base, docx, and csv in non-markdown", () => {
		const customRecords = [
			makeRecord({ path: "note.md" }),
			makeRecord({ path: "board.canvas", isMarkdown: false }),
			makeRecord({ path: "table.base", isMarkdown: false }),
			makeRecord({ path: "document.docx", isMarkdown: false }),
			makeRecord({ path: "data.csv", isMarkdown: false }),
		];
		const result = applyFilters(customRecords, { ...baseQuery, fileKind: "non-markdown" });
		expect(result.map((r) => r.path)).toEqual([
			"board.canvas",
			"table.base",
			"document.docx",
			"data.csv",
		]);
	});

	it("filters images by file kind", () => {
		const result = applyFilters(records, { ...baseQuery, fileKind: "images" });
		expect(result.map((r) => r.path)).toEqual(["assets/photo.png", "assets/screenshot.jpeg"]);
	});

	it("filters by modified within days", () => {
		const result = applyFilters(records, { ...baseQuery, modifiedWithinDays: 1 });
		expect(result.length).toBeLessThan(records.length);
		expect(result.every((r) => r.mtime >= Date.now() - 1 * 24 * 60 * 60 * 1000)).toBe(true);
	});

	it("combines multiple filters", () => {
		const result = applyFilters(records, {
			...baseQuery,
			searchText: "project",
			fileKind: "markdown",
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
