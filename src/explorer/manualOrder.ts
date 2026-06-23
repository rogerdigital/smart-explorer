import type { FileRecord, GroupMode } from "../types";

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
	_sections: ManualOrderSection[],
	group: GroupMode,
	sectionId?: string,
): string[] {
	const nextOrder = [...currentOrder];
	const fromGlobal = nextOrder.indexOf(draggedPath);
	if (fromGlobal < 0) return nextOrder;

	nextOrder.splice(fromGlobal, 1);

	const adjusted = fromGlobal < toIndex ? toIndex - 1 : toIndex;

	let targetGlobal: number;
	if (sectionId && group !== "none") {
		targetGlobal = clampToGroupEnd(nextOrder, adjusted, _sections, sectionId);
	} else {
		targetGlobal = Math.max(0, Math.min(adjusted, nextOrder.length));
	}

	nextOrder.splice(targetGlobal, 0, draggedPath);
	return nextOrder;
}

/**
 * For grouped manual order, keep the dragged item within its section's global
 * span. The adjusted index is measured from the start of the visible list, so
 * we translate it into a global index bounded by the section's first/last row.
 */
function clampToGroupEnd(
	order: string[],
	adjustedIndex: number,
	sections: ManualOrderSection[],
	sectionId: string,
): number {
	const section = sections.find((s) => s.id === sectionId);
	if (!section || section.records.length === 0) {
		return order.length;
	}

	const firstPath = section.records[0]!.path;
	const lastPath = section.records[section.records.length - 1]!.path;
	const firstGlobal = order.indexOf(firstPath);
	const lastGlobal = order.indexOf(lastPath);

	if (firstGlobal < 0 && lastGlobal < 0) return order.length;

	const lower = firstGlobal >= 0 ? firstGlobal : lastGlobal;
	const upper = lastGlobal >= 0 ? lastGlobal + 1 : order.length;
	return Math.max(lower, Math.min(adjustedIndex, upper));
}
