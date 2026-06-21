import type { SortMode } from "../types";

export type ToolbarMoreState = {
	canUndoManualOrder: boolean;
};

export function getToolbarMoreState(sort: SortMode, hasManualUndo: boolean): ToolbarMoreState {
	const isManualSort = sort === "manual";
	return {
		canUndoManualOrder: isManualSort && hasManualUndo,
	};
}
