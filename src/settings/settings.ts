import type { SortMode, GroupMode } from "../types";

export type SmartExplorerSettings = {
	defaultSort: SortMode;
	defaultGroup: GroupMode;
	hiddenExtensions: string[];
	manualOrder: string[];
};

export const DEFAULT_SETTINGS: SmartExplorerSettings = {
	defaultSort: "name-asc",
	defaultGroup: "none",
	hiddenExtensions: [],
	manualOrder: [],
};
