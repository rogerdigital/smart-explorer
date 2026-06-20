import { getToolbarMoreState } from "../toolbarState";

describe("getToolbarMoreState", () => {
	it("only enables delete for custom saved views", () => {
		expect(getToolbarMoreState("builtin-markdown", "name-asc", false).canDeleteSavedView).toBe(false);
		expect(getToolbarMoreState("custom-1", "name-asc", false).canDeleteSavedView).toBe(true);
	});

	it("only enables manual order actions for manual sorting", () => {
		const regular = getToolbarMoreState(null, "name-asc", true);
		expect(regular.canEditManualOrder).toBe(false);
		expect(regular.canUndoManualOrder).toBe(false);

		const manual = getToolbarMoreState(null, "manual", true);
		expect(manual.canEditManualOrder).toBe(true);
		expect(manual.canUndoManualOrder).toBe(true);
	});
});
