import type { App, MetadataCache, TAbstractFile, TFile, TFolder } from "obsidian";
import type { FileRecord } from "../types";

function normalizeParentPath(parentPath: string | undefined): string {
	return parentPath === "/" ? "" : parentPath ?? "";
}

export function normalizeFileRecord(
	file: TFile,
	_cache: MetadataCache | null,
): FileRecord {
	const ext = file.extension.toLowerCase();
	return {
		path: file.path,
		basename: file.basename,
		extension: ext,
		parentPath: normalizeParentPath(file.parent?.path),
		size: file.stat.size,
		ctime: file.stat.ctime,
		mtime: file.stat.mtime,
		isMarkdown: ext === "md",
	};
}

export class FileIndex {
	private app: App;
	private records: Map<string, FileRecord> = new Map();
	// Maintained incrementally so tree renders never rescan every loaded file.
	private folderPaths = new Set<string>();

	constructor(app: App) {
		this.app = app;
	}

	build(): FileRecord[] {
		const files = this.app.vault.getFiles();
		this.records.clear();
		this.folderPaths.clear();
		for (const file of files) {
			const record = normalizeFileRecord(file, this.app.metadataCache);
			this.records.set(file.path, record);
			this.addAncestorFolders(record.parentPath);
		}
		for (const file of this.app.vault.getAllLoadedFiles()) {
			if (isFolder(file) && file.path !== "/") {
				this.folderPaths.add(file.path);
			}
		}
		return this.getAll();
	}

	private addAncestorFolders(parentPath: string): void {
		if (!parentPath) return;
		const parts = parentPath.split("/");
		for (let i = 1; i <= parts.length; i++) {
			this.folderPaths.add(parts.slice(0, i).join("/"));
		}
	}

	getAll(): FileRecord[] {
		return Array.from(this.records.values());
	}

	get(path: string): FileRecord | undefined {
		return this.records.get(path);
	}

	addFile(file: TFile): void {
		const record = normalizeFileRecord(file, this.app.metadataCache);
		this.records.set(file.path, record);
		this.addAncestorFolders(record.parentPath);
	}

	addFolder(folderPath: string): void {
		if (folderPath && folderPath !== "/") this.folderPaths.add(folderPath);
	}

	setFolderPaths(paths: string[]): void {
		this.folderPaths = new Set(paths);
	}

	removeFile(path: string): void {
		this.records.delete(path);
	}

	// Obsidian emits delete only for the folder itself; every indexed child
	// under it must go explicitly or it stays as a ghost row until reload.
	removeFolder(folderPath: string): void {
		const prefix = `${folderPath}/`;
		for (const path of this.records.keys()) {
			if (path.startsWith(prefix)) this.records.delete(path);
		}
		for (const path of this.folderPaths) {
			if (path === folderPath || path.startsWith(prefix)) this.folderPaths.delete(path);
		}
	}

	// Rewrite every record whose path lives at or under oldFolder to its new
	// location after a folder rename/move. Obsidian only emits a single rename
	// event for the folder itself (not for each child), so the index must be
	// patched here or its child records become stale.
	renameFolder(oldFolder: string, newFolder: string): void {
		if (oldFolder === newFolder) return;
		const oldPrefix = `${oldFolder}/`;
		const oldPrefixLen = oldPrefix.length;
		const rewritten: Array<[string, FileRecord]> = [];
		for (const [path, record] of this.records) {
			let newPath: string | null = null;
			if (path === oldFolder) {
				newPath = newFolder;
			} else if (path.startsWith(oldPrefix)) {
				newPath = `${newFolder}/${path.slice(oldPrefixLen)}`;
			}
			if (newPath === null) continue;
			this.records.delete(path);
			// Derive the new parent path from the renamed location.
			const parentPath = newPath.includes("/")
				? newPath.slice(0, newPath.lastIndexOf("/"))
				: "";
			rewritten.push([newPath, { ...record, path: newPath, parentPath }]);
		}
		for (const [path, record] of rewritten) {
			this.records.set(path, record);
		}
		for (const path of this.folderPaths) {
			if (path === oldFolder || path.startsWith(oldPrefix)) {
				this.folderPaths.delete(path);
				this.addAncestorFolders(newFolder);
				const newSub = path === oldFolder ? newFolder : `${newFolder}/${path.slice(oldPrefixLen)}`;
				this.folderPaths.add(newSub);
			}
		}
	}

	getExtensions(): string[] {
		const exts = new Set<string>();
		for (const record of this.records.values()) {
			exts.add(record.extension);
		}
		return Array.from(exts).sort();
	}

	getFolderPaths(): string[] {
		return Array.from(this.folderPaths)
			.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
	}

	get size(): number {
		return this.records.size;
	}
}

function isFolder(file: TAbstractFile): file is TFolder {
	return "children" in file && !("extension" in file);
}
