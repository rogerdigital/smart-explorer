import type { FileRecord } from "../types";

export type PreviewData =
	| { type: "markdown"; heading?: string; paragraph?: string; tags: string[] }
	| { type: "image"; path: string }
	| { type: "binary"; extension: string; size: number; mtime: number };

export function getPreviewData(record: FileRecord): PreviewData {
	if (record.isMarkdown) {
		return {
			type: "markdown",
			heading: record.firstHeading,
			tags: record.tags,
		};
	}

	const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp"]);
	if (imageExtensions.has(record.extension)) {
		return {
			type: "image",
			path: record.path,
		};
	}

	return {
		type: "binary",
		extension: record.extension,
		size: record.size,
		mtime: record.mtime,
	};
}

export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(ts: number): string {
	return new Date(ts).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export function extractFirstParagraph(content: string): string | undefined {
	const lines = content.split("\n");
	let inFrontmatter = false;
	let frontmatterDone = false;
	let inCodeBlock = false;

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const line = lines[lineIndex]!;
		if (!frontmatterDone) {
			if (line.trim() === "---" && !inFrontmatter && lineIndex === 0) {
				inFrontmatter = true;
				continue;
			}
			if (line.trim() === "---" && inFrontmatter) {
				inFrontmatter = false;
				frontmatterDone = true;
				continue;
			}
			if (inFrontmatter) continue;
			frontmatterDone = true;
		}

		if (line.trim().startsWith("```")) {
			inCodeBlock = !inCodeBlock;
			continue;
		}
		if (inCodeBlock) continue;

		const trimmed = line.trim();
		if (trimmed === "") continue;
		if (trimmed.startsWith("#")) continue;
		if (trimmed.startsWith("!--")) continue;
		if (trimmed.startsWith("|")) continue;
		if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) continue;
		if (/^[-*_]{3,}$/.test(trimmed)) continue;

		return trimmed.length > 200 ? trimmed.slice(0, 200) + "..." : trimmed;
	}

	return undefined;
}
