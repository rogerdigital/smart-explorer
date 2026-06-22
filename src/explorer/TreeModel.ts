import type { ExplorerQuery, FileRecord, SortMode } from "../types";
import { applyFilters } from "./filters";
import { sortRecords } from "./sorters";

export type ExplorerTreeFileNode = {
	type: "file";
	id: string;
	name: string;
	path: string;
	record: FileRecord;
	depth: number;
};

export type ExplorerTreeFolderNode = {
	type: "folder";
	id: string;
	name: string;
	path: string;
	depth: number;
	children: ExplorerTreeNode[];
};

export type ExplorerTreeNode = ExplorerTreeFileNode | ExplorerTreeFolderNode;

export type ExplorerTreeRoot = {
	type: "root";
	path: "";
	children: ExplorerTreeNode[];
};

type MutableFolderNode = ExplorerTreeFolderNode & {
	children: ExplorerTreeNode[];
};

export function buildTree(
	records: FileRecord[],
	query: ExplorerQuery,
	manualOrderIndex?: Map<string, number>,
	folderPaths: string[] = [],
): ExplorerTreeRoot {
	const filtered = applyFilters(records, query);
	const sort = query.sort === "manual" ? "name-asc" : query.sort;
	const root: ExplorerTreeRoot = { type: "root", path: "", children: [] };
	const folders = new Map<string, MutableFolderNode>();

	for (const folderPath of folderPaths) {
		ensureFolderPath(root, folders, folderPath);
	}

	for (const record of filtered) {
		const folder = ensureFolderPath(root, folders, record.parentPath);
		const folderDepth = folder.type === "root" ? -1 : folder.depth;
		folder.children.push({
			type: "file",
			id: record.path,
			name: record.basename,
			path: record.path,
			record,
			depth: folderDepth + 1,
		});
	}

	sortFolderChildren(root.children, sort, manualOrderIndex);
	return root;
}

function ensureFolderPath(
	root: ExplorerTreeRoot,
	folders: Map<string, MutableFolderNode>,
	parentPath: string,
): MutableFolderNode | ExplorerTreeRoot {
	if (!parentPath) return root;

	const parts = parentPath.split("/");
	let currentChildren = root.children;
	let currentPath = "";
	let currentFolder: MutableFolderNode | null = null;

	for (let depth = 0; depth < parts.length; depth++) {
		const part = parts[depth]!;
		currentPath = currentPath ? `${currentPath}/${part}` : part;
		let folder = folders.get(currentPath);
		if (!folder) {
			folder = {
				type: "folder",
				id: currentPath,
				name: part,
				path: currentPath,
				depth,
				children: [],
			};
			folders.set(currentPath, folder);
			currentChildren.push(folder);
		}
		currentFolder = folder;
		currentChildren = folder.children;
	}

	return currentFolder ?? root;
}

function sortFolderChildren(
	children: ExplorerTreeNode[],
	sort: Exclude<SortMode, "manual">,
	manualOrderIndex?: Map<string, number>,
) {
	const folders = children.filter((child): child is ExplorerTreeFolderNode => child.type === "folder")
		.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.path.localeCompare(b.path));
	const files = sortRecords(
		children.filter((child): child is ExplorerTreeFileNode => child.type === "file").map((child) => child.record),
		sort,
		manualOrderIndex,
	).map((record) => children.find((child) => child.type === "file" && child.path === record.path)!);

	children.splice(0, children.length, ...folders, ...files);
	for (const folder of folders) {
		sortFolderChildren(folder.children, sort, manualOrderIndex);
	}
}
