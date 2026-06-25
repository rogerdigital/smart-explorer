import type { App, MetadataCache, TAbstractFile, TFile, TFolder } from "obsidian";
import type { FileRecord } from "../types";

const ATTACHMENT_EXTENSIONS = new Set([
	"png", "jpg", "jpeg", "gif", "bmp", "svg", "webp",
	"mp3", "wav", "ogg", "m4a",
	"mp4", "webm", "mov",
	"pdf", "zip", "tar", "gz",
]);

function isAttachment(ext: string): boolean {
	return ATTACHMENT_EXTENSIONS.has(ext.toLowerCase());
}

function normalizeParentPath(parentPath: string | undefined): string {
	return parentPath === "/" ? "" : parentPath ?? "";
}

export function normalizeFileRecord(
	file: TFile,
	cache: MetadataCache | null,
): FileRecord {
	const ext = file.extension.toLowerCase();
	const record: FileRecord = {
		path: file.path,
		basename: file.basename,
		extension: ext,
		parentPath: normalizeParentPath(file.parent?.path),
		size: file.stat.size,
		ctime: file.stat.ctime,
		mtime: file.stat.mtime,
		isMarkdown: ext === "md",
		isAttachment: isAttachment(ext),
		tags: [],
	};

	if (cache && ext === "md") {
		const fileCache = cache.getFileCache(file);
		if (fileCache) {
			if (fileCache.frontmatter) {
				record.frontmatter = fileCache.frontmatter;
			}
			if (fileCache.tags) {
				record.tags = fileCache.tags.map((t) => t.tag.replace(/^#/, ""));
			}
			if (fileCache.headings && fileCache.headings.length > 0) {
				record.firstHeading = fileCache.headings[0]!.heading;
			}
		}
	}

	return record;
}

export class FileIndex {
	private app: App;
	private records: Map<string, FileRecord> = new Map();

	constructor(app: App) {
		this.app = app;
	}

	build(): FileRecord[] {
		const files = this.app.vault.getFiles();
		this.records.clear();
		for (const file of files) {
			const record = normalizeFileRecord(file, this.app.metadataCache);
			this.records.set(file.path, record);
		}
		return this.getAll();
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
	}

	removeFile(path: string): void {
		this.records.delete(path);
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
	}

	getExtensions(): string[] {
		const exts = new Set<string>();
		for (const record of this.records.values()) {
			exts.add(record.extension);
		}
		return Array.from(exts).sort();
	}

	getFolderPaths(): string[] {
		return this.app.vault.getAllLoadedFiles()
			.filter((file): file is TFolder => isFolder(file) && file.path !== "/")
			.map((folder) => folder.path)
			.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
	}

	get size(): number {
		return this.records.size;
	}
}

function isFolder(file: TAbstractFile): file is TFolder {
	return "children" in file && !("extension" in file);
}
