import type { SortMode, GroupMode } from "../types";

export const SORT_OPTIONS: { value: SortMode; text: string }[] = [
	{ value: "name-asc", text: "Name A-Z" },
	{ value: "name-desc", text: "Name Z-A" },
	{ value: "modified-new", text: "Modified (newest)" },
	{ value: "modified-old", text: "Modified (oldest)" },
	{ value: "created-new", text: "Created (newest)" },
	{ value: "created-old", text: "Created (oldest)" },
	{ value: "extension", text: "Extension" },
	{ value: "size", text: "Size" },
	{ value: "manual", text: "Manual" },
];

export const GROUP_OPTIONS: { value: GroupMode; text: string }[] = [
	{ value: "none", text: "No grouping" },
	{ value: "folder", text: "By folder" },
	{ value: "extension", text: "By extension" },
	{ value: "modified-month", text: "By modified month" },
	{ value: "top-folder", text: "By top-level folder" },
];
