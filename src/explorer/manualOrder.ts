import type { FileRecord } from "../types";

export type ManualOrderSection = {
	id: string;
	records: FileRecord[];
};

/**
 * Keeps `currentOrder` in sync with the files currently in the vault.
 *
 * The saved manual order is a snapshot: files added later are missing from it,
 * and files deleted since are stale. Without reconciliation, dragging a file
 * that is missing from the order is a no-op (`indexOf` returns -1), which is
 * why newly created files appear "stuck". Missing files are appended in the
 * given `fallbackOrder` (the current seed-sorted display order) so they land
 * predictably; deleted paths are dropped. Returns the same array reference
 * when nothing changed.
 */
export function reconcileManualOrder(
	currentOrder: string[],
	records: FileRecord[],
	fallbackOrder?: string[],
): string[] {
	const known = new Set(records.map((r) => r.path));
	const pruned = currentOrder.filter((p) => known.has(p));

	const present = new Set(pruned);
	const missing = (fallbackOrder ?? records.map((r) => r.path)).filter(
		(p) => known.has(p) && !present.has(p),
	);

	if (pruned.length === currentOrder.length && missing.length === 0) {
		return currentOrder;
	}

	return [...pruned, ...missing];
}

/**
 * Reorders `currentOrder` by moving `draggedPath` to `toIndex`.
 *
 * `toIndex` is the drop position within the visible row list (the same list
 * `sections` describes), where the dragged row still occupies its original
 * slot while dragging. We therefore resolve the target purely from indices
 * rather than reverse-looking-up paths in `sections`: the dragged path is
 * still present in `sections`, so a `toIndex` that lands on its own slot
 * would otherwise resolve to -1 and silently fall back to the end.
 */
export function reorderManualOrder(
	currentOrder: string[],
	draggedPath: string,
	toIndex: number,
	sections: ManualOrderSection[],
): string[] {
	const visiblePaths = sections.flatMap((section) =>
		section.records.map((record) => record.path),
	);
	const fromVisible = visiblePaths.indexOf(draggedPath);
	if (fromVisible < 0) return [...currentOrder];

	const visibleWithoutDragged = visiblePaths.filter((path) => path !== draggedPath);
	if (visibleWithoutDragged.length === 0) return [...currentOrder];

	const nextOrder = currentOrder.filter((path) => path !== draggedPath);
	if (nextOrder.length === currentOrder.length) return [...currentOrder];

	const adjustedVisibleIndex = fromVisible < toIndex ? toIndex - 1 : toIndex;
	const targetVisibleIndex = Math.max(
		0,
		Math.min(adjustedVisibleIndex, visibleWithoutDragged.length),
	);
	const targetPath = visibleWithoutDragged[targetVisibleIndex];

	let targetGlobalIndex: number;
	if (targetPath !== undefined) {
		targetGlobalIndex = nextOrder.indexOf(targetPath);
		if (targetGlobalIndex < 0) return [...currentOrder];
	} else {
		const lastVisiblePath = visibleWithoutDragged[
			visibleWithoutDragged.length - 1
		];
		const lastVisibleIndex = lastVisiblePath === undefined
			? -1
			: nextOrder.indexOf(lastVisiblePath);
		targetGlobalIndex = lastVisibleIndex < 0
			? nextOrder.length
			: lastVisibleIndex + 1;
	}

	nextOrder.splice(targetGlobalIndex, 0, draggedPath);
	return nextOrder;
}
