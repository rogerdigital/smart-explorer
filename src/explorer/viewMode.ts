import type { SortMode, ViewMode } from "../types";

export function resolveExplorerViewMode(requestedMode: ViewMode, sort: SortMode): ViewMode {
	return sort === "manual" ? "list" : requestedMode;
}
