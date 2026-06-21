import { buildTree } from "../TreeModel";
import type { ExplorerTreeFolderNode, ExplorerTreeNode } from "../TreeModel";
import type { ExplorerQuery, FileRecord } from "../../types";

function makeRecord(path: string, overrides: Partial<FileRecord> = {}): FileRecord {
	return {
		path,
		basename: path.split("/").pop()!.replace(/\.[^.]+$/, ""),
		extension: path.includes(".") ? path.split(".").pop()! : "",
		parentPath: path.includes("/") ? path.split("/").slice(0, -1).join("/") : "",
		size: 100,
		ctime: 1700000000000,
		mtime: 1700000000000,
		isMarkdown: path.endsWith(".md"),
		isAttachment: false,
		tags: [],
		...overrides,
	};
}

const baseQuery: ExplorerQuery = {
	searchText: "",
	sort: "name-asc",
	group: "none",
	extension: null,
	fileKind: "all",
	modifiedWithinDays: null,
};

function expectFolder(node: ExplorerTreeNode | undefined): ExplorerTreeFolderNode {
	expect(node?.type).toBe("folder");
	return node as ExplorerTreeFolderNode;
}

describe("buildTree", () => {
	it("builds folder nodes from file paths", () => {
		const tree = buildTree([
			makeRecord("projects/beta.md"),
			makeRecord("projects/archive/alpha.md"),
			makeRecord("inbox.md"),
		], baseQuery);

		expect(tree.children.map((node) => node.name)).toEqual(["projects", "inbox"]);
		const projects = expectFolder(tree.children.find((node) => node.path === "projects"));
		expect(projects.children.map((node) => node.name)).toEqual(["archive", "beta"]);
	});

	it("sorts files within each folder using the active sort mode", () => {
		const tree = buildTree([
			makeRecord("notes/old.md", { mtime: 1000 }),
			makeRecord("notes/new.md", { mtime: 3000 }),
		], { ...baseQuery, sort: "modified-new" });

		const notes = expectFolder(tree.children.find((node) => node.path === "notes"));
		expect(notes.children.map((node) => node.name)).toEqual(["new", "old"]);
	});

	it("keeps parent folders when filters match a nested file", () => {
		const tree = buildTree([
			makeRecord("projects/archive/alpha.md"),
			makeRecord("daily/beta.md"),
		], { ...baseQuery, searchText: "alpha" });

		expect(tree.children.map((node) => node.path)).toEqual(["projects"]);
		const projects = expectFolder(tree.children[0]);
		expect(projects.children.map((node) => node.path)).toEqual(["projects/archive"]);
		const archive = expectFolder(projects.children[0]);
		expect(archive.children.map((node) => node.path)).toEqual(["projects/archive/alpha.md"]);
	});
});
