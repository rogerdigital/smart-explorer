import type { SortMode, GroupMode } from "../types";

export type SmartExplorerSettings = {
	defaultSort: SortMode;
	defaultGroup: GroupMode;
	previewEnabled: boolean;
	hiddenExtensions: string[];
	markdownOnly: boolean;
	attachmentsOnly: boolean;
};

export const DEFAULT_SETTINGS: SmartExplorerSettings = {
	defaultSort: "name-asc",
	defaultGroup: "none",
	previewEnabled: true,
	hiddenExtensions: [],
	markdownOnly: false,
	attachmentsOnly: false,
};
