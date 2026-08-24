/** @jest-environment jsdom */

jest.mock(
	"obsidian",
	() => {
		const notices: string[] = [];
		return {
			Plugin: class {
				app: unknown;
				manifest: unknown;
				constructor(app: unknown, manifest: unknown) {
					this.app = app;
					this.manifest = manifest;
				}
				async loadData() {
					return null;
				}
				async saveData(_data: unknown) {}
				registerView() {}
				addRibbonIcon() {}
				addCommand() {}
				addSettingTab() {}
			},
			ItemView: class {
				app: unknown;
				containerEl: HTMLElement;

				constructor(leaf: { app: unknown }) {
					this.app = leaf.app;
					this.containerEl = document.createElement("div");
					this.containerEl.append(document.createElement("div"), document.createElement("div"));
				}

				registerEvent() {}
			},
			Menu: class {},
			PluginSettingTab: class {},
			Modal: class {},
			Notice: class {
				constructor(message: string) {
					notices.push(message);
				}
			},
			Platform: { isMobile: false },
			Setting: class {},
			setIcon: jest.fn(),
			TFile: class TFile {},
			TFolder: class TFolder {},
			WorkspaceLeaf: class {},
			__notices: notices,
		};
	},
	{ virtual: true },
);

import "../../test-utils/obsidianDom";
import { TFile, TFolder } from "obsidian";

(globalThis as typeof globalThis & { activeWindow: Window }).activeWindow = window;
import SmartExplorerPlugin from "../../main";
import { normalizeSettings } from "../../settings/settings-normalization";
import { SmartExplorerView } from "../SmartExplorerView";

function makeTFile(path: string): TFile & { path: string } {
	const file = new TFile() as TFile & { path: string };
	const name = path.split("/").pop() ?? path;
	const dot = name.lastIndexOf(".");
	file.path = path;
	(file as any).basename = dot > 0 ? name.slice(0, dot) : name;
	(file as any).extension = dot > 0 ? name.slice(dot + 1) : "";
	(file as any).parent = path.includes("/") ? { path: path.slice(0, path.lastIndexOf("/")) } : null;
	(file as any).stat = { size: 10, ctime: 1, mtime: 1 };
	return file;
}

function makeTFolder(path: string): TFolder & { path: string } {
	const folder = new TFolder() as TFolder & { path: string };
	folder.path = path;
	(folder as any).children = [];
	return folder;
}

function makeHarness() {
	const files = new Map<string, ReturnType<typeof makeTFile>>();
	const folders = new Set<string>();
	const vaultHandlers: Record<string, (file: unknown, oldPath?: string) => void> = {};
	const workspaceHandlers: Record<string, (file: unknown) => void> = {};

	const workspace: any = {
		getActiveFile: () => null,
		getLeaf: () => ({ view: null, openFile: async () => {} }),
		getLeavesOfType: () => [],
		on: (name: string, cb: (file: unknown) => void) => {
			workspaceHandlers[name] = cb;
		},
	};
	const app = {
		vault: {
			getFiles: () => Array.from(files.values()),
			getAllLoadedFiles: () => [
				...Array.from(files.values()),
				...Array.from(folders).map((path) => makeTFolder(path)),
			],
			getAbstractFileByPath: (path: string) => files.get(path) ?? null,
			on: (name: string, cb: (file: unknown, oldPath?: string) => void) => {
				vaultHandlers[name] = cb;
			},
		},
		metadataCache: null,
		workspace,
	};

	const plugin = new SmartExplorerPlugin(app as never, { id: "test" } as never);
	plugin.settings = normalizeSettings(null);
	plugin.saveData = jest.fn(async () => {});

	const view = new SmartExplorerView({ app } as never, plugin as never) as any;
	workspace.getLeavesOfType = () => [{ view }];
	const container = view.containerEl.children[1] as HTMLElement;
	document.body.appendChild(container);
	view.renderShell(container);
	view.fileIndex.build();
	view.renderList();
	view.registerVaultEvents();

	const notices = (jest.requireMock("obsidian") as { __notices: string[] }).__notices;

	return {
		view, plugin, container, files, folders, notices, workspace, workspaceHandlers, vaultHandlers,
		add(path: string) {
			const file = makeTFile(path);
			files.set(path, file);
			folders.add(path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
			return file;
		},
		remove(path: string) {
			files.delete(path);
		},
	};
}

describe("SmartExplorerView lifecycle integration", () => {
	beforeEach(() => {
		jest.useFakeTimers();
		(jest.requireMock("obsidian") as { __notices: string[] }).__notices.length = 0;
	});

	afterEach(() => {
		jest.useRealTimers();
		document.body.innerHTML = "";
	});

	it("create file grows the index and refreshes the debounced DOM count", () => {
		const harness = makeHarness();
		harness.view.viewMode = "list";
		harness.add("existing.md");
		harness.view.fileIndex.build();
		harness.view.renderList();
		const countBefore = harness.container.querySelector(".smart-explorer-file-count")!.textContent;

		const file = harness.add("notes/created.md");
		harness.vaultHandlers.create!(file);
		jest.advanceTimersByTime(300);

		expect(countBefore).toBe("1 file");
		expect(harness.container.querySelector(".smart-explorer-file-count")!.textContent).toContain("2 files");
		expect(harness.container.querySelector('[data-path="notes/created.md"]')).not.toBeNull();
	});

	it("delete folder removes every child from the index and the DOM", () => {
		const harness = makeHarness();
		for (const path of ["keep.md", "gone/a.md", "gone/nested/b.md"]) {
			const file = harness.add(path);
			harness.vaultHandlers.create!(file);
			jest.advanceTimersByTime(300);
		}
		expect(harness.view.fileIndex.getAll()).toHaveLength(3);
		harness.view.selectedPath = "gone/nested/b.md";

		harness.remove("gone/a.md");
		harness.remove("gone/nested/b.md");
		harness.vaultHandlers.delete!(makeTFolder("gone"));
		jest.advanceTimersByTime(300);

		expect(harness.view.fileIndex.getAll().map((record: any) => record.path)).toEqual(["keep.md"]);
		expect(harness.container.querySelector('[data-path="gone/a.md"]')).toBeNull();
		expect(harness.container.querySelector('[data-path="gone/nested/b.md"]')).toBeNull();
		expect(harness.view.selectedPath).toBeNull();
	});

	it("rename folder rewrites child paths and manual order", () => {
		const harness = makeHarness();
		harness.plugin.settings.manualOrder = ["keep.md", "old/a.md", "old/nested/b.md"];
		for (const path of ["keep.md", "old/a.md", "old/nested/b.md"]) {
			harness.add(path);
		}
		harness.view.fileIndex.build();
		harness.view.selectedPath = "old/nested/b.md";
		harness.vaultHandlers.rename!(makeTFolder("new"), "old");
		jest.advanceTimersByTime(300);

		expect(harness.plugin.settings.manualOrder).toEqual(["keep.md", "new/a.md", "new/nested/b.md"]);
		expect(harness.view.fileIndex.get("new/nested/b.md")).toBeDefined();
		expect(harness.view.selectedPath).toBe("new/nested/b.md");
	});

	it("coalesces an event burst into one render", () => {
		const harness = makeHarness();
		const renderSpy = jest.spyOn(harness.view, "renderList");

		for (let index = 0; index < 5; index++) {
			harness.vaultHandlers.create!(harness.add(`burst-${index}.md`));
		}
		jest.advanceTimersByTime(300);
		expect(renderSpy).toHaveBeenCalledTimes(1);
	});

	it("refreshes an open view after a hidden-extension settings change", () => {
		const harness = makeHarness();
		harness.add("a.md");
		harness.add("b.pdf");
		harness.view.fileIndex.build();
		harness.view.renderList();
		expect(harness.container.querySelectorAll(".smart-explorer-row")).toHaveLength(2);

		harness.plugin.settings.hiddenExtensions = ["pdf"];
		harness.plugin.refreshExplorerViews();

		expect(harness.container.querySelectorAll(".smart-explorer-row")).toHaveLength(1);
		expect(harness.container.querySelector('[data-path="b.pdf"]')).toBeNull();
	});

	it("shows a Notice containing the error when opening a file fails", async () => {
		const harness = makeHarness();
		const file = harness.add("broken.md");
		harness.view.app = {
			...harness.view.app,
			vault: {
				...harness.view.app.vault,
				getAbstractFileByPath: () => file,
			},
			workspace: {
				...harness.workspace,
				getLeaf: () => ({
					view: null,
					openFile: async () => {
						throw new Error("leaf exploded");
					},
				}),
			},
		};

		await harness.view.openFile("broken.md");

		expect(harness.notices.some((message) => message.includes("leaf exploded"))).toBe(true);
	});

	it("reports Electron shell failures instead of rejecting or throwing", async () => {
		const harness = makeHarness();
		(harness.view.app.vault as any).adapter = { getBasePath: () => "/vault" };
		const originalRequire = (window as Window & { require?: unknown }).require;
		(window as Window & { require?: unknown }).require = () => ({
			shell: {
				openPath: async () => { throw new Error("open exploded"); },
				showItemInFolder: () => { throw new Error("reveal exploded"); },
			},
		});
		try {
			await expect(harness.view.openInDefaultApp("broken.pdf")).resolves.toBeUndefined();
			await expect(harness.view.revealInFinder("broken.pdf")).resolves.toBeUndefined();

			expect(harness.notices).toEqual(expect.arrayContaining([
				expect.stringContaining("open exploded"),
				expect.stringContaining("reveal exploded"),
			]));
		} finally {
			if (originalRequire === undefined) {
				Reflect.deleteProperty(window, "require");
			} else {
				(window as Window & { require?: unknown }).require = originalRequire;
			}
		}
	});

	it("resolves a pending manual-order save before close completes", async () => {
		const harness = makeHarness();
		harness.view.plugin.settings.manualOrder = ["a.md"];
		harness.view.scheduleSaveOrder();
		expect(harness.view.saveOrderTimeout).not.toBeNull();

		let finishSave!: () => void;
		harness.plugin.saveData = jest.fn(() => new Promise<void>((resolve) => { finishSave = resolve; }));

		let closed = false;
		const closing = harness.view.onClose().then(() => { closed = true; });
		await Promise.resolve();
		await Promise.resolve();
		expect(closed).toBe(false);
		expect(harness.plugin.saveData).toHaveBeenCalledTimes(1);

		finishSave();
		await closing;
		expect(closed).toBe(true);
	});
});
