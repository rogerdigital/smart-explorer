import type { FileRecord, GroupMode } from "../types";

export type ManualOrderSection = {
	id: string;
	records: FileRecord[];
};

export function reorderManualOrder(
	currentOrder: string[],
	draggedPath: string,
	toIndex: number,
	sections: ManualOrderSection[],
	group: GroupMode,
	sectionId?: string,
): string[] {
	const nextOrder = [...currentOrder];
	const fromGlobal = nextOrder.indexOf(draggedPath);
	if (fromGlobal >= 0) {
		nextOrder.splice(fromGlobal, 1);
	}

	let targetGlobal: number;
	if (sectionId && group !== "none") {
		targetGlobal = getGroupedTargetIndex(nextOrder, toIndex, sections, sectionId);
	} else {
		targetGlobal = getFlatTargetIndex(nextOrder, toIndex, sections);
	}

	nextOrder.splice(targetGlobal, 0, draggedPath);
	return nextOrder;
}

function getGroupedTargetIndex(
	order: string[],
	toIndex: number,
	sections: ManualOrderSection[],
	sectionId: string,
): number {
	const section = sections.find((s) => s.id === sectionId);
	if (!section || section.records.length === 0) {
		return order.length;
	}

	const clampedIdx = Math.min(toIndex, section.records.length);
	if (clampedIdx >= section.records.length) {
		const lastPath = section.records[section.records.length - 1]!.path;
		const lastGlobal = order.indexOf(lastPath);
		return lastGlobal >= 0 ? lastGlobal + 1 : order.length;
	}

	const targetPath = section.records[clampedIdx]!.path;
	const targetPos = order.indexOf(targetPath);
	return targetPos >= 0 ? targetPos : order.length;
}

function getFlatTargetIndex(
	order: string[],
	toIndex: number,
	sections: ManualOrderSection[],
): number {
	const allRecords = sections.flatMap((s) => s.records);
	const clampedIdx = Math.min(toIndex, allRecords.length);
	if (clampedIdx >= allRecords.length) {
		return order.length;
	}

	const targetPath = allRecords[clampedIdx]!.path;
	const targetPos = order.indexOf(targetPath);
	return targetPos >= 0 ? targetPos : order.length;
}
