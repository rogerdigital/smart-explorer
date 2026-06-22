import { revealPathInContainer } from "../revealPath";

describe("revealPathInContainer", () => {
	it("scrolls the row matching the path into view", () => {
		const row = makeElement("Projects/Atlas/Launch Brief.md");
		const container = makeContainer([row]);

		expect(revealPathInContainer(container, "Projects/Atlas/Launch Brief.md")).toBe(true);
		expect(row.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
	});

	it("returns false when the path is not rendered", () => {
		const container = makeContainer([]);

		expect(revealPathInContainer(container, "Missing.md")).toBe(false);
	});
});

function makeElement(path: string): HTMLElement {
	return {
		dataset: { path },
		scrollIntoView: jest.fn(),
	} as unknown as HTMLElement;
}

function makeContainer(elements: HTMLElement[]): HTMLElement {
	return {
		querySelectorAll: jest.fn().mockReturnValue(elements),
	} as unknown as HTMLElement;
}
