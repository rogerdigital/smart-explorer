import type { SortMode } from "../types";

export type ToolbarMoreState = {
	canDeleteSavedView: boolean;
	canEditManualOrder: boolean;
	canUndoManualOrder: boolean;
};

export function getToolbarMoreState(
	activeSavedViewId: string | null,
	sort: SortMode,
	hasManualUndo: boolean,
): ToolbarMoreState {
	const isManualSort = sort === "manual";
	return {
		canDeleteSavedView: activeSavedViewId?.startsWith("custom-") ?? false,
		canEditManualOrder: isManualSort,
		canUndoManualOrder: isManualSort && hasManualUndo,
	};
}
