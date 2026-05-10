import type { ExplorerQuery, FileRecord } from "../types";

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

	if (query.markdownOnly) {
		result = result.filter((r) => r.isMarkdown);
	}

	if (query.attachmentsOnly) {
		result = result.filter((r) => r.isAttachment);
	}

	if (query.modifiedWithinDays !== null) {
		const cutoff = Date.now() - query.modifiedWithinDays * 24 * 60 * 60 * 1000;
		result = result.filter((r) => r.mtime >= cutoff);
	}

	return result;
}
