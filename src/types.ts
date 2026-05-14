export type SortMode =
	| "name-asc"
	| "name-desc"
	| "modified-new"
	| "modified-old"
	| "created-new"
	| "created-old"
	| "extension"
	| "size"
	| "manual";

export type GroupMode =
	| "none"
	| "folder"
	| "extension"
	| "modified-month"
	| "top-folder";

export type FileRecord = {
	path: string;
	basename: string;
	extension: string;
	parentPath: string;
	size: number;
	ctime: number;
	mtime: number;
	isMarkdown: boolean;
	isAttachment: boolean;
	frontmatter?: Record<string, unknown>;
	tags: string[];
	firstHeading?: string;
};

export type ExplorerQuery = {
	searchText: string;
	sort: SortMode;
	group: GroupMode;
	extension: string | null;
	markdownOnly: boolean;
	attachmentsOnly: boolean;
	modifiedWithinDays: number | null;
};

export type ExplorerSection = {
	id: string;
	title: string;
	records: FileRecord[];
};
