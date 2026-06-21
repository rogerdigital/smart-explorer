import type { SortMode } from "../types";

export type ToolbarMoreState = {
	canEditManualOrder: boolean;
	canUndoManualOrder: boolean;
};

export function getToolbarMoreState(sort: SortMode, hasManualUndo: boolean): ToolbarMoreState {
	const isManualSort = sort === "manual";
	return {
		canEditManualOrder: isManualSort,
		canUndoManualOrder: isManualSort && hasManualUndo,
	};
}
