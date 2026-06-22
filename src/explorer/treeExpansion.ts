export type TreeExpansionState = {
	expandedPaths: ReadonlySet<string>;
	hasActiveFilters: boolean;
	selectedPath: string | null;
};

export function getAncestorFolderPaths(filePath: string): string[] {
	const parts = filePath.split("/").slice(0, -1);
	return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

export function shouldOpenTreeFolder(folderPath: string, state: TreeExpansionState): boolean {
	return (
		state.hasActiveFilters ||
		state.expandedPaths.has(folderPath) ||
		getAncestorFolderPaths(state.selectedPath ?? "").includes(folderPath)
	);
}

export function areAllTreeFoldersExpanded(folderPaths: string[], expandedPaths: ReadonlySet<string>): boolean {
	return folderPaths.length > 0 && folderPaths.every((path) => expandedPaths.has(path));
}
