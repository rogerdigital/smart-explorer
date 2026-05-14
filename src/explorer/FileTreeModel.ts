import type { ExplorerQuery, ExplorerSection, FileRecord } from "../types";
import { sortRecords } from "./sorters";
import { groupRecords } from "./groupers";
import { applyFilters } from "./filters";

export function buildSections(
	records: FileRecord[],
	query: ExplorerQuery,
	manualOrderIndex?: Map<string, number>,
): ExplorerSection[] {
	const filtered = applyFilters(records, query);
	const sorted = sortRecords(filtered, query.sort, manualOrderIndex);
	return groupRecords(sorted, query.group);
}
