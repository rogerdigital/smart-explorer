import { formatFileModifiedDate, formatFileParent } from "../fileRow";

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
});
