export function formatFileParent(parentPath: string): string {
	return parentPath || "/";
}

export function formatFileModifiedDate(ts: number): string {
	const date = new Date(ts);
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");
}
