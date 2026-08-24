#!/usr/bin/env node
/**
 * Guarded synthetic-fixture generator for large-vault testing.
 *
 * May only create or delete `<vault>/.smart-explorer-large-vault-fixture`.
 * A marker file is written before any file generation; removal refuses to
 * run unless the directory name and marker both match, so an unmarked or
 * mistyped path can never be deleted.
 */
import process from "node:process";
import { parseArgs } from "node:util";
import { mkdir, rm, writeFile, stat, readFile } from "node:fs/promises";
import path from "node:path";

const FIXTURE_DIR_NAME = ".smart-explorer-large-vault-fixture";
const MARKER_FILE_NAME = ".smart-explorer-fixture-marker";
const MIN_FILES = 100;
const MAX_FILES = 50000;
const FOLDER_COUNT = 100;

export function fail(message) {
	throw new Error(message);
}

function parseArguments(argv) {
	try {
		return parseArgs({
			args: argv,
			options: {
				vault: { type: "string" },
				files: { type: "string" },
				remove: { type: "boolean", default: false },
			},
			strict: true,
		});
	} catch (error) {
		fail(error instanceof Error ? error.message : String(error));
	}
}

export function resolveFixturePath(vault) {
	const vaultPath = path.resolve(vault);
	return path.join(vaultPath, FIXTURE_DIR_NAME);
}

export function validateOptions({ values }) {
	if (!values.vault) fail("missing --vault <path>");
	if (values.remove) return { remove: true, vault: values.vault, files: null };
	if (values.files === undefined) fail("missing --files <100-50000>");
	const files = Number(values.files);
	if (!Number.isInteger(files) || files < MIN_FILES || files > MAX_FILES) {
		fail(`--files must be an integer between ${MIN_FILES} and ${MAX_FILES}`);
	}
	return { remove: false, vault: values.vault, files };
}

async function isMarkedFixtureDir(dir) {
	let dirStat;
	try {
		dirStat = await stat(dir);
	} catch {
		return false;
	}
	if (!dirStat.isDirectory()) return false;
	if (path.basename(dir) !== FIXTURE_DIR_NAME) return false;
	try {
		const marker = await readFile(path.join(dir, MARKER_FILE_NAME), "utf8");
		return marker.trim() === "smart-explorer-large-vault-fixture";
	} catch {
		return false;
	}
}

export async function createFixture(vault, files) {
	const dir = resolveFixturePath(vault);
	if (path.dirname(dir) === dir) fail("refusing to operate on a filesystem root");
	await mkdir(dir, { recursive: false });
	await writeFile(path.join(dir, MARKER_FILE_NAME), "smart-explorer-large-vault-fixture\n");

	const perFolder = Math.ceil(files / FOLDER_COUNT);
	const attachments = [
		{ ext: "png", size: 0 },
		{ ext: "pdf", size: 0 },
		{ ext: "docx", size: 0 },
	];
	let created = 0;
	let attachmentIndex = 0;
	for (let folderIndex = 0; folderIndex < FOLDER_COUNT && created < files; folderIndex++) {
		const folder = path.join(dir, `folder-${String(folderIndex).padStart(3, "0")}`);
		await mkdir(folder);
		for (let fileIndex = 0; fileIndex < perFolder && created < files; fileIndex++) {
			const isAttachment = fileIndex % 50 === 49 && fileIndex > 0;
			if (isAttachment) {
				const attachment = attachments[attachmentIndex % attachments.length];
				attachmentIndex++;
				await writeFile(path.join(folder, `attachment-${fileIndex}.${attachment.ext}`), "");
			} else {
				await writeFile(path.join(folder, `note-${fileIndex}.md`), "# Fixture note\n");
			}
			created++;
		}
	}
	console.log(`created ${created} fixture files in ${dir}`);
}

export async function removeFixture(vault) {
	const dir = resolveFixturePath(vault);
	if (!(await isMarkedFixtureDir(dir))) {
		fail("refusing to remove: not a marker-protected fixture directory");
	}
	await rm(dir, { recursive: true, force: false });
	console.log(`removed ${dir}`);
}

async function main() {
	const parsed = parseArguments(process.argv.slice(2));
	const options = validateOptions(parsed);
	if (options.remove) {
		await removeFixture(options.vault);
	} else {
		await createFixture(options.vault, options.files);
	}
}

// Only run main when executed directly (tests import the helpers).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
	try {
		await main();
	} catch (error) {
		console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}
