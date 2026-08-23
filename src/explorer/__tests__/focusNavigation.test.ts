import { resolveFocusNavigation } from "../focusNavigation";

function navigate(key: string, current: number, count: number, folderExpanded: boolean | null = null) {
	return resolveFocusNavigation({ key, current, count, folderExpanded });
}

describe("resolveFocusNavigation", () => {
	it.each([
		["ArrowDown", 2, 5, 3],
		["ArrowUp", 2, 5, 1],
		["Home", 2, 5, 0],
		["End", 2, 5, 4],
	])("maps %s to the expected visible index", (key, current, count, index) => {
		expect(navigate(key, current, count)).toEqual({ type: "focus", index });
	});

	it("clamps ArrowDown at the last row", () => {
		expect(navigate("ArrowDown", 4, 5)).toEqual({ type: "focus", index: 4 });
	});

	it("clamps ArrowUp at the first row", () => {
		expect(navigate("ArrowUp", 0, 5)).toEqual({ type: "focus", index: 0 });
	});

	it("maps Home and End safely on an empty list", () => {
		expect(navigate("Home", 0, 0)).toEqual({ type: "focus", index: 0 });
		expect(navigate("End", 0, 0)).toEqual({ type: "focus", index: 0 });
	});

	it("closes an expanded folder on ArrowLeft", () => {
		expect(navigate("ArrowLeft", 1, 4, true)).toEqual({ type: "collapse" });
	});

	it("opens a collapsed folder on ArrowRight", () => {
		expect(navigate("ArrowRight", 1, 4, false)).toEqual({ type: "expand" });
	});

	it("does not expand or collapse a file row", () => {
		expect(navigate("ArrowRight", 1, 4, null)).toEqual({ type: "none" });
		expect(navigate("ArrowLeft", 1, 4, null)).toEqual({ type: "none" });
	});

	it("activates on Enter and Space", () => {
		expect(navigate("Enter", 0, 3)).toEqual({ type: "activate" });
		expect(navigate(" ", 0, 3)).toEqual({ type: "activate" });
	});

	it("ignores unrelated keys", () => {
		expect(navigate("a", 0, 3)).toEqual({ type: "none" });
		expect(navigate("Tab", 0, 3)).toEqual({ type: "none" });
	});
});
