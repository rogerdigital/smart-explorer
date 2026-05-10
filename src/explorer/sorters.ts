import type { FileRecord, SortMode } from "../types";

function comparePath(a: FileRecord, b: FileRecord): number {
	return a.path.localeCompare(b.path);
}

const sortFns: Record<SortMode, (a: FileRecord, b: FileRecord) => number> = {
	"name-asc": (a, b) => a.basename.localeCompare(b.basename) || comparePath(a, b),
	"name-desc": (a, b) => b.basename.localeCompare(a.basename) || comparePath(a, b),
	"modified-new": (a, b) => b.mtime - a.mtime || comparePath(a, b),
	"modified-old": (a, b) => a.mtime - b.mtime || comparePath(a, b),
	"created-new": (a, b) => b.ctime - a.ctime || comparePath(a, b),
	"created-old": (a, b) => a.ctime - b.ctime || comparePath(a, b),
	"extension": (a, b) => a.extension.localeCompare(b.extension) || comparePath(a, b),
	"size": (a, b) => b.size - a.size || comparePath(a, b),
};

export function sortRecords(records: FileRecord[], mode: SortMode): FileRecord[] {
	return [...records].sort(sortFns[mode]);
}
