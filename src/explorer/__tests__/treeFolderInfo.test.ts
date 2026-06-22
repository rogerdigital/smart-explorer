import { countDirectFiles, countDirectFolders, formatTreeFolderTooltip } from "../treeFolderInfo";
import type { ExplorerTreeFolderNode } from "../TreeModel";

function makeFolder(overrides: Partial<ExplorerTreeFolderNode> = {}): ExplorerTreeFolderNode {
	return {
		type: "folder",
		id: "notes",
		name: "notes",
		path: "notes",
		depth: 0,
		children: [],
		...overrides,
	};
}

describe("tree folder info", () => {
	it("counts only direct child files and folders", () => {
		const nested = makeFolder({
			id: "notes/archive",
			name: "archive",
			path: "notes/archive",
			depth: 1,
			children: [
				{
					type: "file",
					id: "notes/archive/old.md",
					name: "old",
					path: "notes/archive/old.md",
					depth: 2,
					record: {
						path: "notes/archive/old.md",
						basename: "old",
						extension: "md",
						parentPath: "notes/archive",
						size: 1,
						ctime: 1,
						mtime: 1,
						isMarkdown: true,
						isAttachment: false,
						tags: [],
					},
				},
			],
		});
		const folder = makeFolder({
			children: [
				nested,
				{
					type: "file",
					id: "notes/today.md",
					name: "today",
					path: "notes/today.md",
					depth: 1,
					record: {
						path: "notes/today.md",
						basename: "today",
						extension: "md",
						parentPath: "notes",
						size: 1,
						ctime: 1,
						mtime: 1,
						isMarkdown: true,
						isAttachment: false,
						tags: [],
					},
				},
			],
		});

		expect(countDirectFiles(folder)).toBe(1);
		expect(countDirectFolders(folder)).toBe(1);
	});

	it("formats a compact folder tooltip", () => {
		const folder = makeFolder();

		expect(formatTreeFolderTooltip(folder)).toBe("notes\nPath: notes\nFiles: 0\nFolders: 0");
	});
});
