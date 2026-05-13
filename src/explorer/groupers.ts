import type { ExplorerSection, FileRecord, GroupMode } from "../types";

function groupByFolder(records: FileRecord[]): ExplorerSection[] {
	const map = new Map<string, FileRecord[]>();
	for (const r of records) {
		const key = r.parentPath || "/";
		if (!map.has(key)) map.set(key, []);
		map.get(key)!.push(r);
	}
	return Array.from(map.entries())
		.sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
		.map(([id, recs]) => ({
			id,
			title: id,
			records: recs,
		}));
}

function groupByExtension(records: FileRecord[]): ExplorerSection[] {
	const map = new Map<string, FileRecord[]>();
	for (const r of records) {
		const key = `.${r.extension}`;
		if (!map.has(key)) map.set(key, []);
		map.get(key)!.push(r);
	}
	return Array.from(map.entries())
		.sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
		.map(([id, recs]) => ({
			id,
			title: id,
			records: recs,
		}));
}

function groupByModifiedMonth(records: FileRecord[]): ExplorerSection[] {
	const map = new Map<string, FileRecord[]>();
	for (const r of records) {
		const d = new Date(r.mtime);
		const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
		if (!map.has(key)) map.set(key, []);
		map.get(key)!.push(r);
	}
	return Array.from(map.entries())
		.sort(([a], [b]) => b.localeCompare(a))
		.map(([id, recs]) => ({
			id,
			title: id,
			records: recs,
		}));
}

function groupByTopFolder(records: FileRecord[]): ExplorerSection[] {
	const map = new Map<string, FileRecord[]>();
	for (const r of records) {
		const parts = r.parentPath.split("/");
		const key = parts[0] || "/";
		if (!map.has(key)) map.set(key, []);
		map.get(key)!.push(r);
	}
	return Array.from(map.entries())
		.sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
		.map(([id, recs]) => ({
			id,
			title: id,
			records: recs,
		}));
}

export function groupRecords(records: FileRecord[], mode: GroupMode): ExplorerSection[] {
	if (mode === "none") {
		return [{ id: "all", title: "All Files", records }];
	}
	if (mode === "folder") return groupByFolder(records);
	if (mode === "extension") return groupByExtension(records);
	if (mode === "modified-month") return groupByModifiedMonth(records);
	if (mode === "top-folder") return groupByTopFolder(records);
	return [{ id: "all", title: "All Files", records }];
}
