import { isTouchMovePastThreshold } from "../touchLongPress";

describe("touch long press helpers", () => {
	it("keeps long press active while movement stays under the threshold", () => {
		expect(isTouchMovePastThreshold(10, 10, 16, 18)).toBe(false);
	});

	it("cancels long press after meaningful finger movement", () => {
		expect(isTouchMovePastThreshold(10, 10, 30, 10)).toBe(true);
	});
});
