import type { ExplorerQuery, SavedExplorerView } from "../types";

export const DEFAULT_QUERY: ExplorerQuery = {
	searchText: "",
	sort: "name-asc",
	group: "none",
	extension: null,
	markdownOnly: false,
	attachmentsOnly: false,
	modifiedWithinDays: null,
};

export const BUILT_IN_SAVED_VIEWS: SavedExplorerView[] = [
	{
		id: "builtin-recent-notes",
		name: "Recent notes",
		query: {
			...DEFAULT_QUERY,
			sort: "modified-new",
			markdownOnly: true,
			modifiedWithinDays: 7,
		},
	},
	{
		id: "builtin-markdown",
		name: "Markdown files",
		query: {
			...DEFAULT_QUERY,
			markdownOnly: true,
		},
	},
	{
		id: "builtin-attachments",
		name: "Attachments",
		query: {
			...DEFAULT_QUERY,
			attachmentsOnly: true,
		},
	},
	{
		id: "builtin-images",
		name: "Images",
		query: {
			...DEFAULT_QUERY,
			extension: "png",
		},
	},
];

export function cloneSavedViewQuery(query: ExplorerQuery): ExplorerQuery {
	return { ...query };
}

export function getSavedViewOptions(customViews: SavedExplorerView[]): SavedExplorerView[] {
	return [
		...BUILT_IN_SAVED_VIEWS.map((view) => ({
			...view,
			query: cloneSavedViewQuery(view.query),
		})),
		...customViews.map((view) => ({
			...view,
			query: cloneSavedViewQuery(view.query),
		})),
	];
}
