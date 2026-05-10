import { normalizeFileRecord } from "../FileIndex";

function mockTFile(overrides: Partial<{
	path: string;
	basename: string;
	extension: string;
	parent: { path: string } | null;
	size: number;
	ctime: number;
	mtime: number;
}>): any {
	const path = overrides.path ?? "notes/test.md";
	const ext = overrides.extension ?? path.split(".").pop()!;
	const parts = path.split("/");
	const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
	return {
		path,
		basename: overrides.basename ?? parts[parts.length - 1]!.replace(/\.[^.]+$/, ""),
		extension: ext,
		parent: overrides.parent !== undefined ? overrides.parent : (parentPath ? { path: parentPath } : null),
		stat: {
			size: overrides.size ?? 1024,
			ctime: overrides.ctime ?? 1700000000000,
			mtime: overrides.mtime ?? 1700000000000,
		},
	};
}

describe("normalizeFileRecord", () => {
	it("normalizes a markdown file", () => {
		const file = mockTFile({ path: "notes/hello.md" });
		const record = normalizeFileRecord(file, null);
		expect(record.path).toBe("notes/hello.md");
		expect(record.basename).toBe("hello");
		expect(record.extension).toBe("md");
		expect(record.parentPath).toBe("notes");
		expect(record.isMarkdown).toBe(true);
		expect(record.isAttachment).toBe(false);
		expect(record.tags).toEqual([]);
	});

	it("normalizes an image file", () => {
		const file = mockTFile({ path: "assets/photo.png", extension: "png" });
		const record = normalizeFileRecord(file, null);
		expect(record.extension).toBe("png");
		expect(record.isMarkdown).toBe(false);
		expect(record.isAttachment).toBe(true);
	});

	it("normalizes a PDF file", () => {
		const file = mockTFile({ path: "docs/paper.pdf", extension: "pdf" });
		const record = normalizeFileRecord(file, null);
		expect(record.isAttachment).toBe(true);
	});

	it("normalizes a root-level file", () => {
		const file = mockTFile({ path: "README.md", parent: null });
		const record = normalizeFileRecord(file, null);
		expect(record.parentPath).toBe("");
	});

	it("extracts metadata from cache for markdown files", () => {
		const file = mockTFile({ path: "notes/tagged.md" });
		const mockCache: any = {
			getFileCache: () => ({
				frontmatter: { status: "draft" },
				tags: [{ tag: "research" }, { tag: "important" }],
				headings: [{ heading: "Introduction", level: 1 }],
			}),
		};
		const record = normalizeFileRecord(file, mockCache);
		expect(record.frontmatter).toEqual({ status: "draft" });
		expect(record.tags).toEqual(["research", "important"]);
		expect(record.firstHeading).toBe("Introduction");
	});

	it("handles missing cache gracefully", () => {
		const file = mockTFile({ path: "notes/empty.md" });
		const mockCache: any = {
			getFileCache: () => null,
		};
		const record = normalizeFileRecord(file, mockCache);
		expect(record.frontmatter).toBeUndefined();
		expect(record.tags).toEqual([]);
		expect(record.firstHeading).toBeUndefined();
	});

	it("skips metadata cache for non-markdown files", () => {
		const file = mockTFile({ path: "data.csv", extension: "csv" });
		const mockCache: any = {
			getFileCache: jest.fn(),
		};
		normalizeFileRecord(file, mockCache);
		expect(mockCache.getFileCache).not.toHaveBeenCalled();
	});
});
