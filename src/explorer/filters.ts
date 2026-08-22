import type { ExplorerQuery, FileRecord } from "../types";
import { normalizeSearchText } from "./queryNormalization";

const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"]);

export function applyFilters(records: FileRecord[], query: ExplorerQuery): FileRecord[] {
	let result = records;
	const normalizedSearchText = normalizeSearchText(query.searchText);

	if (normalizedSearchText) {
		result = result.filter(
			(r) =>
				r.basename.toLowerCase().includes(normalizedSearchText) ||
				r.path.toLowerCase().includes(normalizedSearchText),
		);
	}

	if (query.extension) {
		result = result.filter((r) => r.extension === query.extension);
	}

	if (query.fileKind === "markdown") {
		result = result.filter((r) => r.isMarkdown);
	}

	if (query.fileKind === "non-markdown") {
		result = result.filter((r) => !r.isMarkdown);
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
