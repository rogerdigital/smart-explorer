export type CreationFolderContext = {
	selectedFolderPath: string | null;
	selectedFilePath: string | null;
	activeFilePath: string | null;
};

export function getParentFolderPath(filePath: string): string {
	const parts = filePath.split("/").slice(0, -1);
	return parts.join("/");
}

export function resolveCreationFolder(context: CreationFolderContext): string {
	return (
		context.selectedFolderPath ??
		(context.selectedFilePath ? getParentFolderPath(context.selectedFilePath) : null) ??
		(context.activeFilePath ? getParentFolderPath(context.activeFilePath) : null) ??
		""
	);
}

export function appendMarkdownExtension(name: string): string {
	return name.toLowerCase().endsWith(".md") ? name : `${name}.md`;
}

export function buildCreationPath(folderPath: string, name: string): string {
	return folderPath ? `${folderPath}/${name}` : name;
}

export function buildSiblingPath(path: string, nextName: string): string {
	return buildCreationPath(getParentFolderPath(path), nextName);
}

export function buildFileRenamePath(path: string, nextBasename: string): string {
	const fileName = path.split("/").pop() ?? path;
	const dotIndex = fileName.lastIndexOf(".");
	const extension = dotIndex > 0 ? fileName.slice(dotIndex) : "";
	return buildSiblingPath(path, `${nextBasename}${extension}`);
}

export function getPathName(path: string): string {
	return path.split("/").pop() ?? path;
}
