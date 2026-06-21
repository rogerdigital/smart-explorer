import { clearSearchAndFilters, hasActiveSearchOrFilters } from "../filterState";
import type { ExplorerQuery } from "../../types";

const baseQuery: ExplorerQuery = {
	searchText: "",
	sort: "manual",
	group: "folder",
	extension: null,
	fileKind: "all",
	modifiedWithinDays: null,
};

describe("filterState", () => {
	it("detects active search or filters", () => {
		expect(hasActiveSearchOrFilters(baseQuery)).toBe(false);
		expect(hasActiveSearchOrFilters({ ...baseQuery, searchText: "daily" })).toBe(true);
		expect(hasActiveSearchOrFilters({ ...baseQuery, fileKind: "images" })).toBe(true);
		expect(hasActiveSearchOrFilters({ ...baseQuery, modifiedWithinDays: 7 })).toBe(true);
	});

	it("clears search and filters without changing sort or group", () => {
		const cleared = clearSearchAndFilters({
			...baseQuery,
			searchText: "daily",
			fileKind: "markdown",
			modifiedWithinDays: 7,
		});

		expect(cleared).toMatchObject({
			searchText: "",
			sort: "manual",
			group: "folder",
			extension: null,
			fileKind: "all",
			modifiedWithinDays: null,
		});
	});
});
