import { getPreviewData, formatFileSize, formatDate, extractFirstParagraph } from "../preview";
import type { FileRecord } from "../../types";

function makeRecord(overrides: Partial<FileRecord> & { path: string }): FileRecord {
	return {
		basename: overrides.path.split("/").pop()!.replace(/\.[^.]+$/, ""),
		extension: overrides.path.split(".").pop()!,
		parentPath: "",
		size: 100,
		ctime: 1700000000000,
		mtime: 1700000000000,
		isMarkdown: overrides.path.endsWith(".md"),
		isAttachment: false,
		tags: [],
		...overrides,
	};
}

describe("getPreviewData", () => {
	it("returns markdown preview for md files", () => {
		const record = makeRecord({
			path: "notes/test.md",
			isMarkdown: true,
			firstHeading: "Introduction",
			tags: ["research", "draft"],
		});
		const preview = getPreviewData(record);
		expect(preview.type).toBe("markdown");
		if (preview.type === "markdown") {
			expect(preview.heading).toBe("Introduction");
			expect(preview.tags).toEqual(["research", "draft"]);
		}
	});

	it("returns markdown preview without heading", () => {
		const record = makeRecord({ path: "notes/plain.md", isMarkdown: true });
		const preview = getPreviewData(record);
		expect(preview.type).toBe("markdown");
		if (preview.type === "markdown") {
			expect(preview.heading).toBeUndefined();
			expect(preview.tags).toEqual([]);
		}
	});

	it("returns image preview for png", () => {
		const record = makeRecord({ path: "img/photo.png", extension: "png", isMarkdown: false });
		const preview = getPreviewData(record);
		expect(preview.type).toBe("image");
		if (preview.type === "image") {
			expect(preview.path).toBe("img/photo.png");
		}
	});

	it("returns image preview for jpg/jpeg/gif/svg/webp", () => {
		for (const ext of ["jpg", "jpeg", "gif", "svg", "webp"]) {
			const record = makeRecord({ path: `img/file.${ext}`, extension: ext, isMarkdown: false });
			expect(getPreviewData(record).type).toBe("image");
		}
	});

	it("returns binary preview for other files", () => {
		const record = makeRecord({
			path: "data/report.pdf",
			extension: "pdf",
			isMarkdown: false,
			size: 2048000,
			mtime: 1700000000000,
		});
		const preview = getPreviewData(record);
		expect(preview.type).toBe("binary");
		if (preview.type === "binary") {
			expect(preview.extension).toBe("pdf");
			expect(preview.size).toBe(2048000);
		}
	});
});

describe("formatFileSize", () => {
	it("formats bytes", () => {
		expect(formatFileSize(500)).toBe("500 B");
	});

	it("formats kilobytes", () => {
		expect(formatFileSize(1536)).toBe("1.5 KB");
	});

	it("formats megabytes", () => {
		expect(formatFileSize(2097152)).toBe("2.0 MB");
	});
});

describe("formatDate", () => {
	it("formats a timestamp", () => {
		const result = formatDate(1700000000000);
		expect(result).toBeTruthy();
		expect(typeof result).toBe("string");
	});
});

describe("extractFirstParagraph", () => {
	it("extracts first paragraph after frontmatter and heading", () => {
		const content = "---\ntitle: Test\n---\n# Heading\n\nThis is the first paragraph.\n\nSecond paragraph.";
		expect(extractFirstParagraph(content)).toBe("This is the first paragraph.");
	});

	it("extracts paragraph without frontmatter", () => {
		const content = "# Title\n\nHello world.\n\nMore text.";
		expect(extractFirstParagraph(content)).toBe("Hello world.");
	});

	it("skips frontmatter only", () => {
		const content = "---\ntitle: Only\n---";
		expect(extractFirstParagraph(content)).toBeUndefined();
	});

	it("skips list items and code blocks", () => {
		const content = "# Title\n\n- list item\n\n```\ncode\n```\n\nActual paragraph.";
		expect(extractFirstParagraph(content)).toBe("Actual paragraph.");
	});

	it("truncates long paragraphs", () => {
		const longLine = "a".repeat(300);
		const result = extractFirstParagraph(longLine);
		expect(result!.endsWith("...")).toBe(true);
		expect(result!.length).toBe(203);
	});

	it("returns undefined for empty content", () => {
		expect(extractFirstParagraph("")).toBeUndefined();
	});

	it("returns undefined for headings only", () => {
		expect(extractFirstParagraph("# H1\n## H2")).toBeUndefined();
	});

	it("does not treat --- as frontmatter if not on first line", () => {
		const content = "# Heading\n\n---\n\nParagraph after horizontal rule.";
		expect(extractFirstParagraph(content)).toBe("Paragraph after horizontal rule.");
	});

	it("handles document starting with horizontal rule (not frontmatter)", () => {
		const content = "Some text\n---\nMore text.";
		expect(extractFirstParagraph(content)).toBe("Some text");
	});

	it("handles frontmatter-only document with no body", () => {
		const content = "---\ntitle: Empty\ntags: []\n---\n";
		expect(extractFirstParagraph(content)).toBeUndefined();
	});

	it("handles horizontal rule in middle of document", () => {
		const content = "---\ntitle: Test\n---\n\n# Heading\n\n---\n\nParagraph.";
		expect(extractFirstParagraph(content)).toBe("Paragraph.");
	});
});
