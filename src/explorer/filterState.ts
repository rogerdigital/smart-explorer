import type { ExplorerQuery } from "../types";

export function hasActiveSearchOrFilters(query: ExplorerQuery): boolean {
	return (
		query.searchText.trim().length > 0 ||
		query.extension !== null ||
		query.fileKind !== "all" ||
		query.modifiedWithinDays !== null
	);
}

export function clearSearchAndFilters(query: ExplorerQuery): ExplorerQuery {
	return {
		...query,
		searchText: "",
		extension: null,
		fileKind: "all",
		modifiedWithinDays: null,
	};
}
