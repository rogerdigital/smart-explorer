import { BUILT_IN_SAVED_VIEWS, cloneSavedViewQuery, getSavedViewOptions } from "../savedViews";
import type { ExplorerQuery } from "../../types";

const baseQuery: ExplorerQuery = {
	searchText: "project",
	sort: "modified-new",
	group: "folder",
	extension: "md",
	markdownOnly: true,
	attachmentsOnly: false,
	modifiedWithinDays: 7,
};

describe("saved views", () => {
	it("provides focused built-in views", () => {
		expect(BUILT_IN_SAVED_VIEWS.map((view) => view.name)).toEqual([
			"Recent notes",
			"Markdown files",
			"Attachments",
			"Images",
		]);
	});

	it("clones queries so saved views are not mutated by toolbar state", () => {
		const clone = cloneSavedViewQuery(baseQuery);
		clone.searchText = "changed";

		expect(baseQuery.searchText).toBe("project");
	});

	it("returns built-in views before custom views", () => {
		const options = getSavedViewOptions([
			{ id: "custom-1", name: "Work", query: baseQuery },
		]);

		expect(options.map((option) => option.name)).toEqual([
			"Recent notes",
			"Markdown files",
			"Attachments",
			"Images",
			"Work",
		]);
	});
});
