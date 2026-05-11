import { App, MetadataCache, TFile } from "obsidian";
import type { FileRecord } from "../types";

const ATTACHMENT_EXTENSIONS = new Set([
	"png", "jpg", "jpeg", "gif", "bmp", "svg",
	"mp3", "wav", "ogg", "m4a",
	"mp4", "webm", "mov",
	"pdf", "zip", "tar", "gz",
]);

function isAttachment(ext: string): boolean {
	return ATTACHMENT_EXTENSIONS.has(ext.toLowerCase());
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
		parentPath: file.parent?.path ?? "",
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
				record.frontmatter = fileCache.frontmatter as Record<string, unknown>;
			}
			if (fileCache.tags) {
				record.tags = fileCache.tags.map((t) => t.tag);
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

	getExtensions(): string[] {
		const exts = new Set<string>();
		for (const record of this.records.values()) {
			exts.add(record.extension);
		}
		return Array.from(exts).sort();
	}

	get size(): number {
		return this.records.size;
	}
}
