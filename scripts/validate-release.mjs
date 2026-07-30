import { readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

export function validateReleaseMetadata(tag, metadata) {
	if (!/^\d+\.\d+\.\d+$/.test(tag)) {
		throw new Error(`Release tag "${tag}" must be a semantic version.`);
	}
	if (
		tag !== metadata.packageVersion ||
		tag !== metadata.manifestVersion
	) {
		throw new Error(
			"Release tag, package.json and manifest.json versions must match.",
		);
	}
	if (!(tag in metadata.versions)) {
		throw new Error(`versions.json is missing release "${tag}".`);
	}
	if (metadata.versions[tag] !== metadata.minAppVersion) {
		throw new Error(
			"versions.json minimum app version must match manifest.json.",
		);
	}
}

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

export function readReleaseMetadata() {
	const packageJson = readJson("package.json");
	const manifest = readJson("manifest.json");
	return {
		packageVersion: packageJson.version,
		manifestVersion: manifest.version,
		minAppVersion: manifest.minAppVersion,
		versions: readJson("versions.json"),
	};
}

const isMainModule =
	process.argv[1] !== undefined &&
	import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
	const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? "";
	try {
		validateReleaseMetadata(tag, readReleaseMetadata());
		console.log(`Release metadata validated for ${tag}.`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
