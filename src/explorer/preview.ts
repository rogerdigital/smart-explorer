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
