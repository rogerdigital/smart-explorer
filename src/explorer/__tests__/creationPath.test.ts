import {
	appendMarkdownExtension,
	buildCreationPath,
	getParentFolderPath,
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
});
