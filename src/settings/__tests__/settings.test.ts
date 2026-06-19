import { DEFAULT_SETTINGS } from "../settings";

describe("DEFAULT_SETTINGS", () => {
	it("keeps settings focused on file-list behavior", () => {
		expect(DEFAULT_SETTINGS).toMatchObject({
			defaultSort: "name-asc",
			defaultGroup: "none",
			hiddenExtensions: [],
			manualOrder: [],
		});
		expect(DEFAULT_SETTINGS).not.toHaveProperty("previewEnabled");
		expect(DEFAULT_SETTINGS).not.toHaveProperty("mobilePreviewEnabled");
	});
});
