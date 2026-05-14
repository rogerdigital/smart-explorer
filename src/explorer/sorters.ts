import type { FileRecord, SortMode } from "../types";

const collatorOpts: Intl.CollatorOptions = { numeric: true };

function comparePath(a: FileRecord, b: FileRecord): number {
	return a.path.localeCompare(b.path, undefined, collatorOpts);
}

const sortFns: Record<Exclude<SortMode, "manual">, (a: FileRecord, b: FileRecord) => number> = {
	"name-asc": (a, b) => a.basename.localeCompare(b.basename, undefined, collatorOpts) || comparePath(a, b),
	"name-desc": (a, b) => b.basename.localeCompare(a.basename, undefined, collatorOpts) || comparePath(a, b),
	"modified-new": (a, b) => b.mtime - a.mtime || comparePath(a, b),
	"modified-old": (a, b) => a.mtime - b.mtime || comparePath(a, b),
	"created-new": (a, b) => b.ctime - a.ctime || comparePath(a, b),
	"created-old": (a, b) => a.ctime - b.ctime || comparePath(a, b),
	"extension": (a, b) => a.extension.localeCompare(b.extension, undefined, collatorOpts) || comparePath(a, b),
	"size": (a, b) => b.size - a.size || comparePath(a, b),
};

export function sortRecords(
	records: FileRecord[],
	mode: SortMode,
	manualOrderIndex?: Map<string, number>,
): FileRecord[] {
	if (mode === "manual") {
		return [...records].sort((a, b) => {
			const ai = manualOrderIndex?.get(a.path) ?? Infinity;
			const bi = manualOrderIndex?.get(b.path) ?? Infinity;
			return ai - bi || comparePath(a, b);
		});
	}
	return [...records].sort(sortFns[mode]);
}
