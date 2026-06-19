import type { SortMode, GroupMode } from "../types";
import type { SavedExplorerView } from "../types";

export type SmartExplorerSettings = {
	defaultSort: SortMode;
	defaultGroup: GroupMode;
	hiddenExtensions: string[];
	manualOrder: string[];
	savedViews: SavedExplorerView[];
};

export const DEFAULT_SETTINGS: SmartExplorerSettings = {
	defaultSort: "name-asc",
	defaultGroup: "none",
	hiddenExtensions: [],
	manualOrder: [],
	savedViews: [],
};
