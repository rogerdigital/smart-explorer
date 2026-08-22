import { normalizeSearchText } from "../queryNormalization";

describe("normalizeSearchText", () => {
	it("trims surrounding whitespace and lowercases text", () => {
		expect(normalizeSearchText("  Projects/ALPHA  ")).toBe("projects/alpha");
	});

	it("returns an empty string for whitespace-only input", () => {
		expect(normalizeSearchText("   \n\t  ")).toBe("");
	});

	it("folds ASCII I independently of the system locale", () => {
		const localeLower = jest.spyOn(String.prototype, "toLocaleLowerCase")
			.mockImplementation(() => {
				throw new Error("locale-sensitive case folding must not be used");
			});

		try {
			expect(normalizeSearchText("  I  ")).toBe("i");
			expect(localeLower).not.toHaveBeenCalled();
		} finally {
			localeLower.mockRestore();
		}
	});
});
