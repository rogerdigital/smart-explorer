import type { GroupMode, SortMode, ViewMode } from "../types";
import { DEFAULT_SETTINGS } from "./settings";
import type { SmartExplorerSettings } from "./settings";

const SORT_MODES = new Set<SortMode>([
	"name-asc",
	"name-desc",
	"modified-new",
	"modified-old",
	"created-new",
	"created-old",
	"extension",
	"size",
	"manual",
]);
const GROUP_MODES = new Set<GroupMode>(["none", "folder", "extension", "modified-month", "top-folder"]);
const VIEW_MODES = new Set<ViewMode>(["tree", "list"]);

function uniqueStrings(value: unknown, normalize: (value: string) => string): string[] {
	if (!Array.isArray(value)) return [];
	const result: string[] = [];
	const seen = new Set<string>();
	for (const item of value) {
		if (typeof item !== "string") continue;
		const normalized = normalize(item);
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		result.push(normalized);
	}
	return result;
}

export function normalizeSettings(value: unknown): SmartExplorerSettings {
	const saved = value !== null && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, unknown>
		: {};
	return {
		defaultSort: SORT_MODES.has(saved.defaultSort as SortMode)
			? saved.defaultSort as SortMode
			: DEFAULT_SETTINGS.defaultSort,
		defaultGroup: GROUP_MODES.has(saved.defaultGroup as GroupMode)
			? saved.defaultGroup as GroupMode
			: DEFAULT_SETTINGS.defaultGroup,
		lastViewMode: VIEW_MODES.has(saved.lastViewMode as ViewMode)
			? saved.lastViewMode as ViewMode
			: DEFAULT_SETTINGS.lastViewMode,
		hiddenExtensions: uniqueStrings(saved.hiddenExtensions, (extension) =>
			extension.trim().toLowerCase().replace(/^\.+/, ""),
		).filter((extension) => extension.length > 0),
		manualOrder: uniqueStrings(saved.manualOrder, (path) => path),
	};
}
