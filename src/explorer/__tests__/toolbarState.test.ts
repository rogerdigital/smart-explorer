import { getToolbarMoreState } from "../toolbarState";

describe("getToolbarMoreState", () => {
	it("only enables manual order actions for manual sorting", () => {
		const regular = getToolbarMoreState("name-asc", true);
		expect(regular.canEditManualOrder).toBe(false);
		expect(regular.canUndoManualOrder).toBe(false);

		const manual = getToolbarMoreState("manual", true);
		expect(manual.canEditManualOrder).toBe(true);
		expect(manual.canUndoManualOrder).toBe(true);
	});
});
