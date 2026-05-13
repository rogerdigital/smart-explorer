import type { SortMode, GroupMode } from "../types";

export type SmartExplorerSettings = {
	defaultSort: SortMode;
	defaultGroup: GroupMode;
	previewEnabled: boolean;
	mobilePreviewEnabled: boolean;
	hiddenExtensions: string[];
};

export const DEFAULT_SETTINGS: SmartExplorerSettings = {
	defaultSort: "name-asc",
	defaultGroup: "none",
	previewEnabled: true,
	mobilePreviewEnabled: true,
	hiddenExtensions: [],
};
