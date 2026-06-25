import { FileIndex, normalizeFileRecord } from "../FileIndex";

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

	it("normalizes the Obsidian root folder path", () => {
		const file = mockTFile({ path: "Home.md", parent: { path: "/" } });
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

	it("strips # prefix from tags", () => {
		const file = mockTFile({ path: "notes/tagged.md" });
		const mockCache: any = {
			getFileCache: () => ({
				tags: [{ tag: "#project" }, { tag: "#todo" }],
			}),
		};
		const record = normalizeFileRecord(file, mockCache);
		expect(record.tags).toEqual(["project", "todo"]);
	});

	it("handles tags without # prefix", () => {
		const file = mockTFile({ path: "notes/tagged.md" });
		const mockCache: any = {
			getFileCache: () => ({
				tags: [{ tag: "plain" }],
			}),
		};
		const record = normalizeFileRecord(file, mockCache);
		expect(record.tags).toEqual(["plain"]);
	});

	it("recognizes webp as attachment", () => {
		const file = mockTFile({ path: "img/photo.webp", extension: "webp" });
		const record = normalizeFileRecord(file, null);
		expect(record.isAttachment).toBe(true);
	});

	it("handles file with no extension", () => {
		const file = mockTFile({ path: "Makefile", extension: "" });
		file.basename = "Makefile";
		const record = normalizeFileRecord(file, null);
		expect(record.extension).toBe("");
		expect(record.isMarkdown).toBe(false);
		expect(record.isAttachment).toBe(false);
	});

	it("handles file with special characters in name", () => {
		const file = mockTFile({ path: "notes/my file (2024).md" });
		file.basename = "my file (2024)";
		const record = normalizeFileRecord(file, null);
		expect(record.basename).toBe("my file (2024)");
		expect(record.path).toBe("notes/my file (2024).md");
	});
});

function makeIndex(): FileIndex {
	// renameFolder only touches the internal record map; a null app is fine
	// because addFile receives a null metadataCache.
	return new FileIndex({} as any);
}

describe("FileIndex.renameFolder", () => {
	it("rewrites paths of files nested under the renamed folder", () => {
		const index = makeIndex();
		index.addFile(mockTFile({ path: "old/a.md" }) as any);
		index.addFile(mockTFile({ path: "old/sub/b.md" }) as any);
		index.addFile(mockTFile({ path: "other/c.md" }) as any);

		index.renameFolder("old", "new");

		expect(index.get("old/a.md")).toBeUndefined();
		expect(index.get("old/sub/b.md")).toBeUndefined();
		expect(index.get("new/a.md")).toBeDefined();
		const nested = index.get("new/sub/b.md");
		expect(nested).toBeDefined();
		expect(nested!.parentPath).toBe("new/sub");
		// Untouched record stays put.
		expect(index.get("other/c.md")).toBeDefined();
	});

	it("preserves record size (no records lost or duplicated)", () => {
		const index = makeIndex();
		index.addFile(mockTFile({ path: "old/x.md" }) as any);
		index.addFile(mockTFile({ path: "old/y.md" }) as any);
		index.addFile(mockTFile({ path: "keep.md" }) as any);

		index.renameFolder("old", "renamed");

		expect(index.size).toBe(3);
	});

	it("is a no-op when old and new folder are identical", () => {
		const index = makeIndex();
		index.addFile(mockTFile({ path: "f/a.md" }) as any);
		const before = index.get("f/a.md");

		index.renameFolder("f", "f");

		expect(index.get("f/a.md")).toBe(before);
	});

	it("does not match folders that merely share a name prefix", () => {
		const index = makeIndex();
		index.addFile(mockTFile({ path: "old/file.md" }) as any);
		index.addFile(mockTFile({ path: "old-backup/file.md" }) as any);

		index.renameFolder("old", "new");

		// "old-backup" must NOT be rewritten even though it starts with "old".
		expect(index.get("new/file.md")).toBeDefined();
		expect(index.get("old-backup/file.md")).toBeDefined();
		expect(index.get("new-backup/file.md")).toBeUndefined();
	});
});
