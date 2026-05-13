import { groupRecords } from "../groupers";
import type { FileRecord, GroupMode } from "../../types";

function makeRecord(path: string, mtime?: number): FileRecord {
	return {
		path,
		basename: path.split("/").pop()!.replace(/\.[^.]+$/, ""),
		extension: path.split(".").pop()!,
		parentPath: path.includes("/") ? path.split("/").slice(0, -1).join("/") : "",
		size: 100,
		ctime: 1700000000000,
		mtime: mtime ?? 1700000000000,
		isMarkdown: path.endsWith(".md"),
		isAttachment: false,
		tags: [],
	};
}

const records: FileRecord[] = [
	makeRecord("notes/project-a.md", 1703980800000),
	makeRecord("notes/project-b.md", 1704067200000),
	makeRecord("assets/image.png", 1703980800000),
	makeRecord("readme.md", 1704067200000),
];

describe("groupRecords", () => {
	it("returns single section for mode 'none'", () => {
		const sections = groupRecords(records, "none");
		expect(sections).toHaveLength(1);
		expect(sections[0]!.title).toBe("All Files");
		expect(sections[0]!.records).toHaveLength(4);
	});

	it("groups by folder", () => {
		const sections = groupRecords(records, "folder");
		const folderNames = sections.map((s) => s.id).sort();
		expect(folderNames).toEqual(["/", "assets", "notes"]);
		const notesSection = sections.find((s) => s.id === "notes");
		expect(notesSection!.records).toHaveLength(2);
	});

	it("groups by extension", () => {
		const sections = groupRecords(records, "extension");
		const extNames = sections.map((s) => s.id).sort();
		expect(extNames).toEqual([".md", ".png"]);
		const mdSection = sections.find((s) => s.id === ".md");
		expect(mdSection!.records).toHaveLength(3);
	});

	it("groups by modified month sorted newest first", () => {
		const sections = groupRecords(records, "modified-month");
		expect(sections.length).toBeGreaterThan(0);
		for (let i = 1; i < sections.length; i++) {
			expect(sections[i - 1]!.id >= sections[i]!.id).toBe(true);
		}
	});

	it("groups by top-level folder", () => {
		const deep = [
			makeRecord("projects/2024/q1.md"),
			makeRecord("projects/2023/old.md"),
			makeRecord("assets/img/photo.png"),
		];
		const sections = groupRecords(deep, "top-folder");
		const topFolders = sections.map((s) => s.id).sort();
		expect(topFolders).toEqual(["assets", "projects"]);
		const projectsSection = sections.find((s) => s.id === "projects");
		expect(projectsSection!.records).toHaveLength(2);
	});

	it("handles empty records", () => {
		const sections = groupRecords([], "folder");
		expect(sections).toHaveLength(0);
	});

	it("sorts folder groups alphabetically", () => {
		const files = [
			makeRecord("zebra/z.md"),
			makeRecord("alpha/a.md"),
			makeRecord("middle/m.md"),
		];
		const sections = groupRecords(files, "folder");
		expect(sections.map((s) => s.id)).toEqual(["alpha", "middle", "zebra"]);
	});

	it("sorts top-folder groups alphabetically", () => {
		const files = [
			makeRecord("zoo/sub/a.md"),
			makeRecord("archive/old.md"),
			makeRecord("notes/n.md"),
		];
		const sections = groupRecords(files, "top-folder");
		expect(sections.map((s) => s.id)).toEqual(["archive", "notes", "zoo"]);
	});

	it("sorts extension groups alphabetically", () => {
		const files = [
			makeRecord("file.txt"),
			makeRecord("file.csv"),
			makeRecord("file.md"),
		];
		const sections = groupRecords(files, "extension");
		expect(sections.map((s) => s.id)).toEqual([".csv", ".md", ".txt"]);
	});

	it("places root files under / in folder group", () => {
		const files = [
			makeRecord("root.md"),
			makeRecord("notes/nested.md"),
		];
		const sections = groupRecords(files, "folder");
		const rootSection = sections.find((s) => s.id === "/");
		expect(rootSection).toBeDefined();
		expect(rootSection!.records).toHaveLength(1);
		expect(rootSection!.records[0]!.basename).toBe("root");
	});
});
