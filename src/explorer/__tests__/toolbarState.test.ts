import { getToolbarMoreState } from "../toolbarState";

describe("getToolbarMoreState", () => {
	it("only enables manual undo for manual sorting with undo history", () => {
		const regular = getToolbarMoreState("name-asc", true);
		expect(regular.canUndoManualOrder).toBe(false);

		const manual = getToolbarMoreState("manual", true);
		expect(manual.canUndoManualOrder).toBe(true);
	});
});
