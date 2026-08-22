import {
	buildTree,
	sortTreeFileNodes,
} from "../TreeModel";
import type {
	ExplorerTreeFileNode,
	ExplorerTreeFolderNode,
	ExplorerTreeNode,
} from "../TreeModel";
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

	it("includes empty folders when folder paths are provided", () => {
		const tree = buildTree([
			makeRecord("Home.md"),
		], baseQuery, undefined, ["00-Inbox", "02-Projects/Atlas Launch"]);

		expect(tree.children.map((node) => node.path)).toEqual(["00-Inbox", "02-Projects", "Home.md"]);
		const projects = expectFolder(tree.children.find((node) => node.path === "02-Projects"));
		expect(projects.children.map((node) => node.path)).toEqual(["02-Projects/Atlas Launch"]);
	});
});

describe("sortTreeFileNodes", () => {
	it("sorts file nodes without losing node identity", () => {
		const oldNode: ExplorerTreeFileNode = {
			type: "file",
			id: "notes/old.md",
			name: "old",
			path: "notes/old.md",
			record: makeRecord("notes/old.md", { mtime: 1000 }),
			depth: 1,
		};
		const newNode: ExplorerTreeFileNode = {
			type: "file",
			id: "notes/new.md",
			name: "new",
			path: "notes/new.md",
			record: makeRecord("notes/new.md", { mtime: 3000 }),
			depth: 1,
		};

		const result = sortTreeFileNodes(
			[oldNode, newNode],
			"modified-new",
		);

		expect(result).toEqual([newNode, oldNode]);
		expect(result[0]).toBe(newNode);
		expect(result[1]).toBe(oldNode);
	});
});
