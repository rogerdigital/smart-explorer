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

export function formatFileCount(count: number): string {
	return `${count} ${count === 1 ? "file" : "files"}`;
}

export function formatVisibleFileCount(displayed: number, total: number): string {
	return displayed === total ? formatFileCount(total) : `${displayed} of ${formatFileCount(total)}`;
}
