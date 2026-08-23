import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	validateOptions,
	resolveFixturePath,
	createFixture,
	removeFixture,
} from "../prepare-large-vault-fixture.mjs";

function parsed(values) {
	return { values };
}

function expectFailure(fn, messagePart) {
	assert.throws(fn, (error) => {
		if (messagePart) assert.match(String(error.message ?? ""), new RegExp(messagePart));
		return true;
	});
}

test("missing --vault fails", () => {
	expectFailure(() => validateOptions(parsed({ files: "5000" })), "missing --vault");
});

test("missing --files fails without --remove", () => {
	expectFailure(() => validateOptions(parsed({ vault: "/tmp/x" })), "missing --files");
});

test("--files outside 100-50000 fails", () => {
	expectFailure(() => validateOptions(parsed({ vault: "/tmp/x", files: "99" })), "between 100 and 50000");
	expectFailure(() => validateOptions(parsed({ vault: "/tmp/x", files: "50001" })), "between 100 and 50000");
	expectFailure(() => validateOptions(parsed({ vault: "/tmp/x", files: "abc" })), "integer");
});

test("cleanup refuses an unmarked directory", async () => {
	const vault = await mkdtemp(path.join(tmpdir(), "se-fixture-"));
	const fixture = resolveFixturePath(vault);
	await mkdir(fixture);
	await writeFile(path.join(fixture, "note.md"), "# keep");

	await assert.rejects(() => removeFixture(vault), /refusing to remove/);

	// Unchanged.
	await assert.ok((await stat(fixture)).isDirectory());
	await rm(vault, { recursive: true });
});

test("cleanup never deletes the vault root", async () => {
	const vault = await mkdtemp(path.join(tmpdir(), "se-fixture-"));
	await writeFile(path.join(vault, "important.md"), "keep");

	await assert.rejects(() => removeFixture(vault), /refusing to remove/);
	await assert.equal((await readFileSafe(path.join(vault, "important.md"))), "keep");

	await rm(vault, { recursive: true });
});

test("a temp-directory fixture creates and removes exactly its own subtree", async () => {
	const vault = await mkdtemp(path.join(tmpdir(), "se-fixture-"));
	await writeFile(path.join(vault, "untouched.md"), "keep");

	await createFixture(vault, 100);

	const fixture = resolveFixturePath(vault);
	const entries = await readdir(vault);
	assert.ok(entries.includes(".smart-explorer-large-vault-fixture"));
	assert.ok(entries.includes("untouched.md"));

	const fixtureEntries = await readdir(fixture);
	assert.ok(fixtureEntries.includes(".smart-explorer-fixture-marker"));
	const folders = fixtureEntries.filter((entry) => entry.startsWith("folder-"));
	assert.equal(folders.length, 100);

	await removeFixture(vault);

	const after = await readdir(vault);
	assert.deepEqual(after, ["untouched.md"]);

	await rm(vault, { recursive: true });
});

async function readFileSafe(file) {
	const { readFile } = await import("node:fs/promises");
	return readFile(file, "utf8");
}
