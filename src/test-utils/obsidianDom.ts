export interface TestElementInfo {
	cls?: string | string[];
	text?: string | DocumentFragment;
	attr?: Record<string, string | number | boolean | null>;
	value?: string;
	type?: string;
	placeholder?: string;
	title?: string;
	href?: string;
	parent?: Node;
	prepend?: boolean;
}

type TestCreateEl = (tag: string, info?: TestElementInfo) => HTMLElement;
type TestCreateDiv = (info?: TestElementInfo) => HTMLDivElement;
type TestCreateSpan = (info?: TestElementInfo) => HTMLSpanElement;

interface TestElementMethods {
	empty?: (this: HTMLElement) => void;
	setText?: (this: HTMLElement, text: string) => void;
	createEl?: TestCreateEl;
	createDiv?: TestCreateDiv;
	createSpan?: TestCreateSpan;
}

interface TestGlobals {
	activeDocument?: Document;
	createEl?: TestCreateEl;
	createDiv?: TestCreateDiv;
	createSpan?: TestCreateSpan;
	requestAnimationFrame?: typeof requestAnimationFrame;
	cancelAnimationFrame?: typeof cancelAnimationFrame;
	CSS?: { escape(value: string): string };
}

export interface ElementBox {
	top?: number;
	left?: number;
	width?: number;
	height?: number;
}

interface BoxRect {
	x: number;
	y: number;
	top: number;
	left: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
}

const runtimeGlobals = window as Window & TestGlobals;
runtimeGlobals.activeDocument ??= runtimeGlobals.document;
const activeTestDocument = runtimeGlobals.activeDocument ?? runtimeGlobals.document;

function normalizeClasses(cls?: string | string[]): string[] {
	if (!cls) return [];

	const values = Array.isArray(cls) ? cls : [cls];
	return values.flatMap((value) => value.split(/\s+/)).filter(Boolean);
}

function setStringProperty(element: HTMLElement, key: string, value: string): void {
	(element as unknown as Record<string, string>)[key] = value;
}

function applyInfo<T extends HTMLElement>(element: T, info?: TestElementInfo): T {
	if (!info) return element;

	const classes = normalizeClasses(info.cls);
	if (classes.length > 0) element.classList.add(...classes);
	if (info.text !== undefined) {
		if (typeof info.text === "string") element.textContent = info.text;
		else {
			element.replaceChildren(info.text.cloneNode(true));
		}
	}

	for (const [name, value] of Object.entries(info.attr ?? {})) {
		if (value === null) element.removeAttribute(name);
		else element.setAttribute(name, String(value));
	}

	if (info.value !== undefined) {
		setStringProperty(element, "value", info.value);
		element.setAttribute("value", info.value);
	}

	if (info.type !== undefined && "type" in element) {
		setStringProperty(element, "type", info.type);
	}

	if (info.placeholder !== undefined && "placeholder" in element) {
		setStringProperty(element, "placeholder", info.placeholder);
	}

	if (info.title !== undefined) {
		element.title = info.title;
	}

	if (info.href !== undefined && "href" in element) {
		setStringProperty(element, "href", info.href);
	}

	if (info.parent) {
		const parent = info.parent as ParentNode;
		if (info.prepend && "prepend" in parent) parent.prepend(element);
		else info.parent.appendChild(element);
	}

	return element;
}

const createEl: TestCreateEl = (tag, info) =>
	applyInfo(activeTestDocument.createElement(tag), info);
const createDiv: TestCreateDiv = (info) =>
	applyInfo(activeTestDocument.createElement("div"), info);
const createSpan: TestCreateSpan = (info) =>
	applyInfo(activeTestDocument.createElement("span"), info);

const elementPrototype = HTMLElement.prototype as HTMLElement & TestElementMethods;

function definePrototypeMethod<K extends keyof TestElementMethods>(
	name: K,
	value: NonNullable<TestElementMethods[K]>,
): void {
	if (elementPrototype[name]) return;

	Object.defineProperty(elementPrototype, name, {
		configurable: true,
		writable: true,
		value,
	});
}

function defineGlobal<K extends keyof TestGlobals>(
	name: K,
	value: NonNullable<TestGlobals[K]>,
): void {
	if (runtimeGlobals[name]) return;

	Object.defineProperty(runtimeGlobals, name, {
		configurable: true,
		writable: true,
		value,
	});
}

export function installObsidianDomShim(): void {
	definePrototypeMethod("empty", function empty(this: HTMLElement): void {
		this.replaceChildren();
	});

	definePrototypeMethod("setText", function setText(this: HTMLElement, text: string): void {
		this.textContent = text;
	});

	definePrototypeMethod("createEl", function createElOnElement(
		this: HTMLElement,
		tag: string,
		info?: TestElementInfo,
	): HTMLElement {
		const element = createEl(tag, info);
		this.appendChild(element);
		return element;
	});

	definePrototypeMethod("createDiv", function createDivOnElement(
		this: HTMLElement,
		info?: TestElementInfo,
	): HTMLDivElement {
		const element = createDiv(info);
		this.appendChild(element);
		return element;
	});

	definePrototypeMethod("createSpan", function createSpanOnElement(
		this: HTMLElement,
		info?: TestElementInfo,
	): HTMLSpanElement {
		const element = createSpan(info);
		this.appendChild(element);
		return element;
	});

	defineGlobal("createEl", createEl);
	defineGlobal("createDiv", createDiv);
	defineGlobal("createSpan", createSpan);

	if (!runtimeGlobals.CSS) {
		defineGlobal("CSS", { escape: (value: string) => String(value) });
	}

	if (!runtimeGlobals.requestAnimationFrame) {
		defineGlobal("requestAnimationFrame", (callback) =>
			runtimeGlobals.setTimeout(() => callback(runtimeGlobals.performance.now()), 0),
		);
	}

	if (!runtimeGlobals.cancelAnimationFrame) {
		defineGlobal("cancelAnimationFrame", (handle) =>
			runtimeGlobals.clearTimeout(handle),
		);
	}
}

installObsidianDomShim();

export function mockElementBox(element: HTMLElement, box: ElementBox = {}): void {
	const top = box.top ?? 0;
	const left = box.left ?? 0;
	const width = box.width ?? 0;
	const height = box.height ?? 0;
	const rectJson: BoxRect = {
		x: left,
		y: top,
		top,
		left,
		right: left + width,
		bottom: top + height,
		width,
		height,
	};

	Object.defineProperties(element, {
		clientHeight: { configurable: true, value: height },
		offsetHeight: { configurable: true, value: height },
		offsetTop: { configurable: true, value: top },
	});

	element.getBoundingClientRect = (): DOMRect => ({
		...rectJson,
		toJSON: () => rectJson,
	});
}
