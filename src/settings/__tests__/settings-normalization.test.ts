import { normalizeSettings } from "../settings-normalization";

describe("normalizeSettings", () => {
	it("migrates the 0.5.4 schema without losing saved preferences or manual order", () => {
		// Fields verified against tag 0.5.4:src/settings/settings.ts.
		const saved = {
			defaultSort: "manual", defaultGroup: "folder",
			hiddenExtensions: ["png"], manualOrder: ["b.md", "a.md"],
		};
		expect(normalizeSettings(saved)).toEqual({ ...saved, lastViewMode: "tree" });
		expect(saved.manualOrder).toEqual(["b.md", "a.md"]);
	});

	it("preserves the 0.6.1 schema including list mode across a save/load round trip", () => {
		const saved = {
			defaultSort: "manual", defaultGroup: "folder", lastViewMode: "list",
			hiddenExtensions: ["png"], manualOrder: ["b.md", "a.md"],
		};
		const loaded = normalizeSettings(saved);
		expect(loaded).toEqual(saved);
		expect(normalizeSettings(JSON.parse(JSON.stringify(loaded)))).toEqual(saved);
	});

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
