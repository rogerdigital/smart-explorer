import { calculateDropIndexFromRowBounds } from "../dropIndex";

describe("calculateDropIndexFromRowBounds", () => {
	it("inserts before the row when the pointer is above that row midpoint", () => {
		const rows = [
			{ top: 0, bottom: 28 },
			{ top: 28, bottom: 56 },
			{ top: 56, bottom: 84 },
		];

		expect(calculateDropIndexFromRowBounds(36, rows)).toBe(1);
	});

	it("inserts after the row when the pointer passes that row midpoint", () => {
		const rows = [
			{ top: 0, bottom: 28 },
			{ top: 28, bottom: 56 },
			{ top: 56, bottom: 84 },
		];

		expect(calculateDropIndexFromRowBounds(46, rows)).toBe(2);
	});
});
