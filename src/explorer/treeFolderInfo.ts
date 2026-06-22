import type { ExplorerTreeFolderNode } from "./TreeModel";

export function countDirectFiles(node: ExplorerTreeFolderNode): number {
	return node.children.filter((child) => child.type === "file").length;
}

export function countDirectFolders(node: ExplorerTreeFolderNode): number {
	return node.children.filter((child) => child.type === "folder").length;
}

export function formatTreeFolderTooltip(node: ExplorerTreeFolderNode): string {
	return [
		node.name,
		`Path: ${node.path || "/"}`,
		`Files: ${countDirectFiles(node)}`,
		`Folders: ${countDirectFolders(node)}`,
	].join("\n");
}
