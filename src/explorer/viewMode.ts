import type { GroupMode, SortMode, ViewMode } from "../types";

export function resolveExplorerViewMode(requestedMode: ViewMode, sort: SortMode): ViewMode {
	return sort === "manual" ? "list" : requestedMode;
}

export function resolveExplorerGroupMode(group: GroupMode, sort: SortMode): GroupMode {
	return sort === "manual" ? "none" : group;
}

/**
 * Decides the manual-order seed sort when the user switches sort modes.
 *
 * "What you see is what you drag": switching INTO manual mode seeds the order
 * from the sort the user was just viewing. Otherwise the existing seed is kept.
 * Returning the existing seed (rather than a default) keeps the fallback order
 * for files added during the session stable across re-renders.
 */
export function resolveManualSeedSort(
	prevSort: SortMode,
	nextSort: SortMode,
	currentSeed: Exclude<SortMode, "manual">,
): Exclude<SortMode, "manual"> {
	if (nextSort === "manual" && prevSort !== "manual") {
		return prevSort;
	}
	return currentSeed;
}
