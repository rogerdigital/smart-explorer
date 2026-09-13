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

test("fixture content lives in a visible directory that Obsidian can index", () => {
	assert.equal(path.basename(resolveFixturePath("/tmp/vault")), "smart-explorer-large-vault-fixture");
});

test("missing --files fails without --remove", () => {
	expectFailure(() => validateOptions(parsed({ vault: "/tmp/x" })), "missing --files");
});

test("--files outside 100-50000 fails", () => {
	expectFailure(() => validateOptions(parsed({ vault: "/tmp/x", files: "99" })), "between 100 and 50000");
	expectFailure(() => validateOptions(parsed({ vault: "/tmp/x", files: "50001" })), "between 100 and 50000");
	expectFailure(() => validateOptions(parsed({ vault: "/tmp/x", files: "abc" })), "integer");
});

test("unknown --layout fails", () => {
	expectFailure(() => validateOptions(parsed({ vault: "/tmp/x", files: "100", layout: "wide" })), "--layout");
});

test("layout defaults to folders and --remove ignores layout", () => {
	assert.equal(validateOptions(parsed({ vault: "/tmp/x", files: "100" })).layout, "folders");
	assert.deepEqual(validateOptions(parsed({ vault: "/tmp/x", remove: true, layout: "flat" })).files, null);
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
	assert.ok(entries.includes("smart-explorer-large-vault-fixture"));
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

test("a 5000-file fixture rotates through every attachment format", async () => {
	const vault = await mkdtemp(path.join(tmpdir(), "se-fixture-"));
	try {
		await createFixture(vault, 5000);
		const fixture = resolveFixturePath(vault);
		const extensions = new Set();
		for (const folder of await readdir(fixture)) {
			if (!folder.startsWith("folder-")) continue;
			for (const file of await readdir(path.join(fixture, folder))) {
				extensions.add(path.extname(file).slice(1));
			}
		}

		assert.deepEqual([...extensions].sort(), ["docx", "md", "pdf", "png"]);
	} finally {
		await rm(vault, { recursive: true });
	}
});

test("a flat fixture puts every file directly in the fixture directory", async () => {
	const vault = await mkdtemp(path.join(tmpdir(), "se-fixture-"));
	try {
		await createFixture(vault, 100, "flat");

		const fixture = resolveFixturePath(vault);
		const entries = await readdir(fixture);
		const files = entries.filter((entry) => entry !== ".smart-explorer-fixture-marker");
		assert.equal(files.length, 100);
		for (const entry of entries) {
			assert.ok((await stat(path.join(fixture, entry))).isFile(), `${entry} should be a file`);
		}
		assert.ok(entries.some((entry) => entry.endsWith(".png")));

		await removeFixture(vault);
		assert.deepEqual(await readdir(vault), []);
	} finally {
		await rm(vault, { recursive: true });
	}
});

async function readFileSafe(file) {
	const { readFile } = await import("node:fs/promises");
	return readFile(file, "utf8");
}
