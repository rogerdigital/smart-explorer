import { normalizeSettings } from "../settings-normalization";

describe("normalizeSettings", () => {
	it("falls back to defaults for corrupt enum values", () => {
		expect(normalizeSettings({
			defaultSort: "random",
			defaultGroup: "date",
			lastViewMode: "grid",
		})).toMatchObject({
			defaultSort: "name-asc",
			defaultGroup: "none",
			lastViewMode: "tree",
		});
	});

	it("normalizes hidden extensions and preserves the first occurrence", () => {
		expect(normalizeSettings({ hiddenExtensions: [".PNG", " png ", "CSS", 9] }).hiddenExtensions)
			.toEqual(["png", "css"]);
	});

	it("keeps only unique string manual-order paths", () => {
		expect(normalizeSettings({ manualOrder: ["b", "a", "b", 9] }).manualOrder)
			.toEqual(["b", "a"]);
	});

	it("preserves an empty manual-order path while deduplicating it", () => {
		expect(normalizeSettings({ manualOrder: ["", "a", ""] }).manualOrder)
			.toEqual(["", "a"]);
	});

	it.each([null, [], { hiddenExtensions: null, manualOrder: "a" }])(
		"handles malformed settings safely: %p",
		(value) => {
			expect(normalizeSettings(value)).toEqual({
				defaultSort: "name-asc",
				defaultGroup: "none",
				lastViewMode: "tree",
				hiddenExtensions: [],
				manualOrder: [],
			});
		},
	);
});
