import { resolveExplorerViewMode } from "../viewMode";

describe("resolveExplorerViewMode", () => {
	it("keeps tree mode for regular sorting", () => {
		expect(resolveExplorerViewMode("tree", "name-asc")).toBe("tree");
	});

	it("keeps list mode when the user switches to list", () => {
		expect(resolveExplorerViewMode("list", "modified-new")).toBe("list");
	});

	it("uses list mode for manual sorting", () => {
		expect(resolveExplorerViewMode("tree", "manual")).toBe("list");
	});
});
