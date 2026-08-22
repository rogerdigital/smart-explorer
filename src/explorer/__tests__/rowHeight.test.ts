import { getListRowHeight } from "../rowHeight";

describe("list row height", () => {
	it("matches the desktop and mobile CSS row heights", () => {
		expect(getListRowHeight(false)).toBe(44);
		expect(getListRowHeight(true)).toBe(52);
	});
});
