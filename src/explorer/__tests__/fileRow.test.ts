import {
	formatFileCount,
	formatFileModifiedDate,
	formatFileParent,
	formatVisibleFileCount,
} from "../fileRow";

describe("file row formatting", () => {
	it("formats root-level files with a slash parent", () => {
		expect(formatFileParent("")).toBe("/");
	});

	it("formats nested parent paths unchanged", () => {
		expect(formatFileParent("projects/smart-explorer")).toBe("projects/smart-explorer");
	});

	it("formats modified dates as a compact local date", () => {
		expect(formatFileModifiedDate(new Date(2026, 5, 9, 13, 45).getTime())).toBe("2026-06-09");
	});

	it.each([
		[0, "0 files"],
		[1, "1 file"],
		[2, "2 files"],
	])("formats %d file count with correct grammar", (count, expected) => {
		expect(formatFileCount(count)).toBe(expected);
	});

	it("includes the unfiltered total when only some files are visible", () => {
		expect(formatVisibleFileCount(2, 10)).toBe("2 of 10 files");
		expect(formatVisibleFileCount(0, 1)).toBe("0 of 1 file");
	});

	it("uses normal file-count grammar when every file is visible", () => {
		expect(formatVisibleFileCount(1, 1)).toBe("1 file");
		expect(formatVisibleFileCount(2, 2)).toBe("2 files");
	});
});
