export type RowBounds = {
	top: number;
	bottom: number;
};

export function calculateDropIndexFromRowBounds(pointerY: number, rows: RowBounds[]): number {
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i]!;
		const midpoint = row.top + (row.bottom - row.top) / 2;
		if (pointerY < midpoint) return i;
	}
	return rows.length;
}
