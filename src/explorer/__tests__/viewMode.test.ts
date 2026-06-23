import { resolveExplorerGroupMode, resolveExplorerViewMode, resolveManualSeedSort } from "../viewMode";

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

describe("resolveExplorerGroupMode", () => {
	it("uses no grouping for manual sorting", () => {
		expect(resolveExplorerGroupMode("folder", "manual")).toBe("none");
	});

	it("keeps grouping for regular sorting", () => {
		expect(resolveExplorerGroupMode("folder", "name-asc")).toBe("folder");
	});
});

describe("resolveManualSeedSort", () => {
	it("seeds from the sort the user was viewing when switching into manual", () => {
		expect(resolveManualSeedSort("modified-new", "manual", "name-asc")).toBe("modified-new");
	});

	it("keeps the existing seed when switching between non-manual sorts", () => {
		expect(resolveManualSeedSort("name-asc", "size", "modified-new")).toBe("modified-new");
	});

	it("keeps the existing seed when already in manual and re-applying manual", () => {
		expect(resolveManualSeedSort("manual", "manual", "created-old")).toBe("created-old");
	});

	it("keeps the existing seed when switching out of manual", () => {
		expect(resolveManualSeedSort("manual", "name-asc", "modified-new")).toBe("modified-new");
	});
});
