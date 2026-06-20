import type { ExplorerQuery, FileRecord } from "../types";

const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"]);

export function applyFilters(records: FileRecord[], query: ExplorerQuery): FileRecord[] {
	let result = records;

	if (query.searchText) {
		const lower = query.searchText.toLowerCase();
		result = result.filter(
			(r) => r.basename.toLowerCase().includes(lower) || r.path.toLowerCase().includes(lower),
		);
	}

	if (query.extension) {
		result = result.filter((r) => r.extension === query.extension);
	}

	if (query.fileKind === "markdown") {
		result = result.filter((r) => r.isMarkdown);
	}

	if (query.fileKind === "attachments") {
		result = result.filter((r) => r.isAttachment);
	}

	if (query.fileKind === "images") {
		result = result.filter((r) => IMAGE_EXTENSIONS.has(r.extension.toLowerCase()));
	}

	if (query.modifiedWithinDays !== null) {
		const cutoff = Date.now() - query.modifiedWithinDays * 24 * 60 * 60 * 1000;
		result = result.filter((r) => r.mtime >= cutoff);
	}

	return result;
}
