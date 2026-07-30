import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const workflowsDirectory = new URL("../../.github/workflows/", import.meta.url);
const workflowFiles = readdirSync(workflowsDirectory).filter((file) =>
	file.endsWith(".yml"),
);

test("uses Node 24-based GitHub actions", () => {
	for (const action of ["actions/checkout", "actions/setup-node"]) {
		const versions = workflowFiles.flatMap((file) => {
			const workflow = readFileSync(new URL(file, workflowsDirectory), "utf8");
			return [...workflow.matchAll(new RegExp(`${action}@v(\\d+)`, "g"))].map(
				(match) => ({
					file,
					version: Number(match[1]),
				}),
			);
		});

		assert.ok(versions.length > 0, `${action} is not used by any workflow`);
		assert.deepEqual(
			versions.filter(({ version }) => version < 7),
			[],
			`${action} must use v7 or newer`,
		);
	}
});
