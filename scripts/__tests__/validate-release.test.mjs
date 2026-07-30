import assert from "node:assert/strict";
import test from "node:test";
import { validateReleaseMetadata } from "../validate-release.mjs";

const valid = {
	packageVersion: "0.5.1",
	manifestVersion: "0.5.1",
	minAppVersion: "1.7.2",
	versions: { "0.5.1": "1.7.2" },
};

test("accepts matching release metadata", () => {
	assert.doesNotThrow(() => validateReleaseMetadata("0.5.1", valid));
});

test("rejects a non-semver tag", () => {
	assert.throws(
		() => validateReleaseMetadata("test-0.5.1", valid),
		/semantic version/,
	);
});

test("rejects package and manifest version mismatches", () => {
	assert.throws(
		() => validateReleaseMetadata("0.5.1", {
			...valid,
			manifestVersion: "0.5.0",
		}),
		/package.json and manifest.json/,
	);
});

test("rejects a missing versions entry", () => {
	assert.throws(
		() => validateReleaseMetadata("0.5.1", {
			...valid,
			versions: {},
		}),
		/versions.json/,
	);
});

test("rejects a mismatched minimum app version", () => {
	assert.throws(
		() => validateReleaseMetadata("0.5.1", {
			...valid,
			versions: { "0.5.1": "1.8.0" },
		}),
		/minimum app version/,
	);
});
