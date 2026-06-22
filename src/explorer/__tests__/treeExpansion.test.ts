import { areAllTreeFoldersExpanded, getAncestorFolderPaths, shouldOpenTreeFolder } from "../treeExpansion";

describe("tree expansion", () => {
	it("keeps folders closed by default", () => {
		expect(shouldOpenTreeFolder("Projects", {
			expandedPaths: new Set(),
			hasActiveFilters: false,
			selectedPath: null,
		})).toBe(false);
	});

	it("opens folders explicitly expanded during the session", () => {
		expect(shouldOpenTreeFolder("Projects", {
			expandedPaths: new Set(["Projects"]),
			hasActiveFilters: false,
			selectedPath: null,
		})).toBe(true);
	});

	it("opens filtered tree folders so matching results are visible", () => {
		expect(shouldOpenTreeFolder("Projects/Atlas", {
			expandedPaths: new Set(),
			hasActiveFilters: true,
			selectedPath: null,
		})).toBe(true);
	});

	it("opens ancestors of the selected file", () => {
		expect(shouldOpenTreeFolder("Projects/Atlas", {
			expandedPaths: new Set(),
			hasActiveFilters: false,
			selectedPath: "Projects/Atlas/Launch Brief.md",
		})).toBe(true);
	});

	it("returns every ancestor folder path for a file", () => {
		expect(getAncestorFolderPaths("Projects/Atlas/Launch Brief.md")).toEqual([
			"Projects",
			"Projects/Atlas",
		]);
	});

	it("detects whether every visible folder is explicitly expanded", () => {
		expect(areAllTreeFoldersExpanded(["Projects", "Projects/Atlas"], new Set(["Projects"]))).toBe(false);
		expect(areAllTreeFoldersExpanded(["Projects", "Projects/Atlas"], new Set(["Projects", "Projects/Atlas"]))).toBe(true);
		expect(areAllTreeFoldersExpanded([], new Set())).toBe(false);
	});
});
