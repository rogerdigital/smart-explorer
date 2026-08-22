import type { SortMode, GroupMode, ViewMode } from "../types";

export type SmartExplorerSettings = {
	defaultSort: SortMode;
	defaultGroup: GroupMode;
	lastViewMode: ViewMode;
	hiddenExtensions: string[];
	manualOrder: string[];
};

export const DEFAULT_SETTINGS: SmartExplorerSettings = {
	defaultSort: "name-asc",
	defaultGroup: "none",
	lastViewMode: "tree",
	hiddenExtensions: [],
	manualOrder: [],
};
