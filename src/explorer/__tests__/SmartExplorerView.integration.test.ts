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
				eventRefs: Array<{ off: () => void }> = [];
				registerEvent(ref: { off: () => void }) { this.eventRefs.push(ref); }
				unloadEvents() { this.eventRefs.splice(0).forEach((ref) => ref.off()); }
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

				eventRefs: Array<{ off: () => void }> = [];
				registerEvent(ref: { off: () => void }) { this.eventRefs.push(ref); }
				unloadEvents() { this.eventRefs.splice(0).forEach((ref) => ref.off()); }
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

async function makeHarness() {
	const files = new Map<string, ReturnType<typeof makeTFile>>();
	const folders = new Set<string>();
	const vaultHandlers = new Map<string, Array<(file: any, oldPath?: string) => void>>();
	const onVault = (name: string, cb: (file: any, oldPath?: string) => void) => {
		const handlers = vaultHandlers.get(name) ?? [];
		handlers.push(cb);
		vaultHandlers.set(name, handlers);
		return { off: () => { handlers.splice(handlers.indexOf(cb), 1); } };
	};
	const emitVault = (name: string, file: unknown, oldPath?: string) => {
		for (const cb of [...(vaultHandlers.get(name) ?? [])]) cb(file, oldPath);
	};
	const workspaceHandlers: Record<string, (file: unknown) => void> = {};

	const workspace: any = {
		getActiveFile: () => null,
		getLeaf: () => ({ view: null, openFile: async () => {} }),
		getLeavesOfType: () => [],
		on: (name: string, cb: (file: unknown) => void) => {
			workspaceHandlers[name] = cb;
			return { off: () => { if (workspaceHandlers[name] === cb) delete workspaceHandlers[name]; } };
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
			on: onVault,
		},
		metadataCache: null,
		workspace,
	};

	const plugin = new SmartExplorerPlugin(app as never, { id: "test" } as never);
	await plugin.onload();
	plugin.saveData = jest.fn(async () => {});

	const views: any[] = [];
	workspace.getLeavesOfType = () => views.map((view) => ({ view }));
	const openView = () => {
		const view = new SmartExplorerView({ app } as never, plugin as never) as any;
		views.push(view);
		const container = view.containerEl.children[1] as HTMLElement;
		document.body.appendChild(container);
		view.renderShell(container);
		view.fileIndex.build();
		view.renderList();
		view.registerVaultEvents();
		return view;
	};
	const closeView = async (view: any) => {
		await view.onClose();
		view.unloadEvents(); // Component event cleanup follows ItemView.onClose in the host.
		views.splice(views.indexOf(view), 1);
	};
	const view = openView();
	const container = document.body.lastElementChild as HTMLElement;

	const notices = (jest.requireMock("obsidian") as { __notices: string[] }).__notices;

	return {
		view, plugin, container, files, folders, notices, workspace, workspaceHandlers, vaultHandlers, emitVault, openView, closeView,
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

	it("create file grows the index and refreshes the debounced DOM count", async () => {
		const harness = await makeHarness();
		harness.view.viewMode = "list";
		harness.add("existing.md");
		harness.view.fileIndex.build();
		harness.view.renderList();
		const countBefore = harness.container.querySelector(".smart-explorer-file-count")!.textContent;

		const file = harness.add("notes/created.md");
		harness.emitVault("create", file);
		jest.advanceTimersByTime(300);

		expect(countBefore).toBe("1 file");
		expect(harness.container.querySelector(".smart-explorer-file-count")!.textContent).toContain("2 files");
		expect(harness.container.querySelector('[data-path="notes/created.md"]')).not.toBeNull();
	});

	it("delete folder removes every child from the index and the DOM", async () => {
		const harness = await makeHarness();
		for (const path of ["keep.md", "gone/a.md", "gone/nested/b.md"]) {
			const file = harness.add(path);
			harness.emitVault("create", file);
			jest.advanceTimersByTime(300);
		}
		expect(harness.view.fileIndex.getAll()).toHaveLength(3);
		harness.view.selectedPath = "gone/nested/b.md";

		harness.remove("gone/a.md");
		harness.remove("gone/nested/b.md");
		harness.emitVault("delete", makeTFolder("gone"));
		jest.advanceTimersByTime(300);

		expect(harness.view.fileIndex.getAll().map((record: any) => record.path)).toEqual(["keep.md"]);
		expect(harness.container.querySelector('[data-path="gone/a.md"]')).toBeNull();
		expect(harness.container.querySelector('[data-path="gone/nested/b.md"]')).toBeNull();
		expect(harness.view.selectedPath).toBeNull();
	});

	it("rename folder rewrites child paths and manual order", async () => {
		const harness = await makeHarness();
		harness.plugin.settings.manualOrder = ["keep.md", "old/a.md", "old/nested/b.md"];
		for (const path of ["keep.md", "old/a.md", "old/nested/b.md"]) {
			harness.add(path);
		}
		harness.view.fileIndex.build();
		harness.view.selectedPath = "old/nested/b.md";
		harness.remove("old/a.md");
		harness.remove("old/nested/b.md");
		harness.folders.delete("old");
		harness.add("new/a.md");
		harness.add("new/nested/b.md");
		harness.emitVault("rename", makeTFolder("new"), "old");
		jest.advanceTimersByTime(300);

		expect(harness.plugin.settings.manualOrder).toEqual(["keep.md", "new/a.md", "new/nested/b.md"]);
		expect(harness.view.fileIndex.get("new/nested/b.md")).toBeDefined();
		expect(harness.view.selectedPath).toBe("new/nested/b.md");
	});

	it("coalesces an event burst into one render", async () => {
		const harness = await makeHarness();
		const renderSpy = jest.spyOn(harness.view, "renderList");

		for (let index = 0; index < 5; index++) {
			harness.emitVault("create", harness.add(`burst-${index}.md`));
		}
		jest.advanceTimersByTime(300);
		expect(renderSpy).toHaveBeenCalledTimes(1);
	});

	it("refreshes an open view after a hidden-extension settings change", async () => {
		const harness = await makeHarness();
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
		const harness = await makeHarness();
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
		const harness = await makeHarness();
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
		const harness = await makeHarness();
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


describe("manual order structural event integration", () => {
	beforeEach(() => { jest.useFakeTimers(); });
	afterEach(() => { jest.useRealTimers(); document.body.innerHTML = ""; });

	it.each(["rename", "create", "delete", "folder"])("Undo and drag survive %s before and after rebuild", async (event) => {
		for (const waitForRebuild of [false, true]) {
			const h = await makeHarness();
			const initial = event === "folder" ? ["old/a.md", "old/b.md", "z.md"] : ["a.md", "b.md", "c.md"];
			initial.forEach((path) => h.add(path));
			h.view.fileIndex.build();
			h.view.query.sort = "manual";
			h.plugin.settings.manualOrder = [...initial];
			h.view.renderList();
			h.view.handleManualReorder(initial[0], 2, h.view.currentSections);
			let expected = [...initial];
			if (event === "rename") {
				h.remove("a.md");
				h.emitVault("rename", h.add("renamed.md"), "a.md");
				expected[0] = "renamed.md";
			} else if (event === "create") {
				h.emitVault("create", h.add("new.md"));
				expected.push("new.md");
			} else if (event === "delete") {
				const file = h.files.get("a.md");
				h.remove("a.md");
				h.emitVault("delete", file);
				expected = ["b.md", "c.md"];
			} else {
				for (const path of initial.slice(0, 2)) { h.remove(path); h.add(path.replace("old/", "new/")); }
				h.folders.delete("old");
				h.emitVault("rename", makeTFolder("new"), "old");
				expected = ["new/a.md", "new/b.md", "z.md"];
			}
			if (waitForRebuild) jest.advanceTimersByTime(300);
			h.view.undoManualReorder();
			expect(h.plugin.settings.manualOrder).toEqual(expected);
			const dragPath = event === "create" ? "new.md" : expected[0];
			h.view.handleManualReorder(dragPath, event === "create" ? 0 : expected.length, h.view.currentSections);
			expect(h.plugin.settings.manualOrder).not.toEqual(expected);
			jest.advanceTimersByTime(500);
			await h.plugin.flushSettings();
			const saved = (h.plugin.saveData as jest.Mock).mock.calls.slice(-1)[0][0].manualOrder;
			expect([...saved].sort()).toEqual([...h.files.keys()].sort());
			expect(new Set(saved).size).toBe(saved.length);
			await h.closeView(h.view);
		}
	});

	it("pending save timers in two panes retain paths migrated by the plugin", async () => {
		const h = await makeHarness();
		h.add("a.md"); h.add("b.md");
		h.plugin.settings.manualOrder = ["a.md", "b.md"];
		h.view.fileIndex.build();
		const second = h.openView();
		for (const view of [h.view, second]) {
			view.query.sort = "manual";
			view.renderList();
			view.scheduleSaveOrder();
		}
		jest.advanceTimersByTime(450);
		h.remove("a.md");
		h.emitVault("rename", h.add("renamed.md"), "a.md");
		jest.advanceTimersByTime(50); // Saves run before the 300ms redraw.
		await h.plugin.flushSettings();
		expect(h.plugin.settings.manualOrder).toEqual(["renamed.md", "b.md"]);
		for (const [snapshot] of (h.plugin.saveData as jest.Mock).mock.calls) {
			expect(snapshot.manualOrder).toEqual(["renamed.md", "b.md"]);
		}
		await h.closeView(h.view);
		await h.closeView(second);
	});

	it("migrates both panes, saves once and continues tracking after every pane closes", async () => {
		const h = await makeHarness();
		h.add("old/a.md"); h.add("b.md");
		h.plugin.settings.manualOrder = ["b.md", "old/a.md"];
		h.view.fileIndex.build();
		const second = h.openView();
		for (const view of [h.view, second]) {
			view.query.sort = "manual";
			view.renderList();
			view.manualOrderUndoStack = [["old/a.md", "b.md"]];
		}
		(h.plugin.saveData as jest.Mock).mockClear();
		h.remove("old/a.md"); h.add("new/a.md");
		h.emitVault("rename", makeTFolder("new"), "old");
		jest.advanceTimersByTime(500);
		await h.plugin.flushSettings();
		expect(h.plugin.saveData).toHaveBeenCalledTimes(1);
		for (const view of [h.view, second]) {
			expect(view.manualOrderUndoStack).toEqual([["new/a.md", "b.md"]]);
			expect(view.fileIndex.get("new/a.md")).toBeDefined();
			await h.closeView(view);
		}
		expect(h.vaultHandlers.get("rename")).toHaveLength(1);
		h.remove("new/a.md");
		h.emitVault("rename", h.add("renamed.md"), "new/a.md");
		await h.plugin.flushSettings();
		const reopened = h.openView();
		expect(h.plugin.settings.manualOrder).toEqual(["b.md", "renamed.md"]);
		expect(h.vaultHandlers.get("rename")).toHaveLength(2);
		await h.closeView(reopened);
		expect(h.vaultHandlers.get("rename")).toHaveLength(1);
		(h.plugin as any).unloadEvents();
		expect(h.vaultHandlers.get("rename")).toHaveLength(0);
	});
});
