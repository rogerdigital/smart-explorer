import { buildSections } from "../FileTreeModel";
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
	fileKind: "all",
	modifiedWithinDays: null,
};

const records: FileRecord[] = [
	makeRecord({ path: "notes/beta.md", mtime: 2000, ctime: 1000, size: 500 }),
	makeRecord({ path: "notes/alpha.md", mtime: 3000, ctime: 2000, size: 200 }),
	makeRecord({ path: "assets/image.png", mtime: 1000, ctime: 3000, size: 1000, isAttachment: true, isMarkdown: false }),
	makeRecord({ path: "readme.md", mtime: 4000, ctime: 4000, size: 300 }),
];

describe("buildSections", () => {
	it("returns single sorted section with default query", () => {
		const sections = buildSections(records, baseQuery);
		expect(sections).toHaveLength(1);
		expect(sections[0]!.records.map((r) => r.basename)).toEqual(["alpha", "beta", "image", "readme"]);
	});

	it("filters then sorts", () => {
		const sections = buildSections(records, { ...baseQuery, searchText: "alpha" });
		expect(sections).toHaveLength(1);
		expect(sections[0]!.records).toHaveLength(1);
		expect(sections[0]!.records[0]!.basename).toBe("alpha");
	});

	it("sorts by modified-new then groups by folder", () => {
		const sections = buildSections(records, { ...baseQuery, sort: "modified-new", group: "folder" });
		expect(sections.length).toBeGreaterThan(1);
		const notesSection = sections.find((s) => s.id === "notes");
		expect(notesSection).toBeDefined();
		expect(notesSection!.records[0]!.basename).toBe("alpha");
	});

	it("returns empty sections for empty input", () => {
		const sections = buildSections([], baseQuery);
		expect(sections).toHaveLength(1);
		expect(sections[0]!.records).toHaveLength(0);
	});

	it("returns empty sections when all filtered out", () => {
		const sections = buildSections(records, { ...baseQuery, searchText: "nonexistent" });
		expect(sections).toHaveLength(1);
		expect(sections[0]!.records).toHaveLength(0);
	});

	it("combines markdown file kind filter with extension group", () => {
		const sections = buildSections(records, { ...baseQuery, fileKind: "markdown", group: "extension" });
		expect(sections).toHaveLength(1);
		expect(sections[0]!.id).toBe(".md");
		expect(sections[0]!.records).toHaveLength(3);
	});

	it("groups by top-folder with sort by size", () => {
		const sections = buildSections(records, { ...baseQuery, sort: "size", group: "top-folder" });
		const ids = sections.map((s) => s.id);
		expect(ids).toContain("notes");
		expect(ids).toContain("assets");
	});
});
