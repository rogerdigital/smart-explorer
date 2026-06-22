import {
	appendMarkdownExtension,
	buildFileRenamePath,
	buildSiblingPath,
	buildCreationPath,
	getParentFolderPath,
	getPathName,
	resolveCreationFolder,
} from "../creationPath";

describe("creation path helpers", () => {
	it("uses the selected folder as the creation target", () => {
		expect(resolveCreationFolder({
			selectedFolderPath: "02-Projects/Atlas Launch",
			selectedFilePath: "Home.md",
			activeFilePath: "03-Areas/Writing/Essay Ideas.md",
		})).toBe("02-Projects/Atlas Launch");
	});

	it("falls back to the selected file parent", () => {
		expect(resolveCreationFolder({
			selectedFolderPath: null,
			selectedFilePath: "03-Areas/Writing/Essay Ideas.md",
			activeFilePath: null,
		})).toBe("03-Areas/Writing");
	});

	it("falls back to the active file parent", () => {
		expect(resolveCreationFolder({
			selectedFolderPath: null,
			selectedFilePath: null,
			activeFilePath: "01-Daily Notes/2026/06/2026-06-11.md",
		})).toBe("01-Daily Notes/2026/06");
	});

	it("uses the vault root when there is no folder context", () => {
		expect(resolveCreationFolder({
			selectedFolderPath: null,
			selectedFilePath: null,
			activeFilePath: null,
		})).toBe("");
	});

	it("gets a parent folder from nested and root files", () => {
		expect(getParentFolderPath("Home.md")).toBe("");
		expect(getParentFolderPath("02-Projects/Atlas Launch/Brief.md")).toBe("02-Projects/Atlas Launch");
	});

	it("adds markdown extension only when needed", () => {
		expect(appendMarkdownExtension("Launch Brief")).toBe("Launch Brief.md");
		expect(appendMarkdownExtension("Launch Brief.md")).toBe("Launch Brief.md");
	});

	it("builds a normalized path under the target folder", () => {
		expect(buildCreationPath("02-Projects", "Launch Brief.md")).toBe("02-Projects/Launch Brief.md");
		expect(buildCreationPath("", "Home.md")).toBe("Home.md");
	});

	it("builds a renamed path beside the original item", () => {
		expect(buildSiblingPath("02-Projects/Atlas Launch/Brief.md", "Plan.md")).toBe("02-Projects/Atlas Launch/Plan.md");
		expect(buildSiblingPath("Home.md", "Start.md")).toBe("Start.md");
		expect(buildSiblingPath("02-Projects/Atlas Launch", "Roadmap")).toBe("02-Projects/Roadmap");
	});

	it("renames files without allowing the extension to change", () => {
		expect(buildFileRenamePath("02-Projects/Brief.md", "Plan")).toBe("02-Projects/Plan.md");
		expect(buildFileRenamePath("02-Projects/Brief.md", "Plan.txt")).toBe("02-Projects/Plan.txt.md");
		expect(buildFileRenamePath("Image.png", "Cover")).toBe("Cover.png");
	});

	it("gets the display name from a path", () => {
		expect(getPathName("02-Projects/Atlas Launch")).toBe("Atlas Launch");
		expect(getPathName("Home.md")).toBe("Home.md");
	});
});
