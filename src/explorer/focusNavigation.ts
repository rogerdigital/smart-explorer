export type FocusNavigationAction =
	| { type: "focus"; index: number }
	| { type: "expand" }
	| { type: "collapse" }
	| { type: "activate" }
	| { type: "none" };

/**
 * Maps a key pressed on a list row or tree folder summary to the focus or
 * folder action it should produce, in visible-row coordinates.
 */
export function resolveFocusNavigation(input: {
	key: string;
	current: number;
	count: number;
	folderExpanded: boolean | null;
}): FocusNavigationAction {
	if (input.key === "Home") return { type: "focus", index: 0 };
	if (input.key === "End") return { type: "focus", index: Math.max(0, input.count - 1) };
	if (input.key === "ArrowDown") return { type: "focus", index: Math.min(input.count - 1, input.current + 1) };
	if (input.key === "ArrowUp") return { type: "focus", index: Math.max(0, input.current - 1) };
	if (input.key === "ArrowRight" && input.folderExpanded === false) return { type: "expand" };
	if (input.key === "ArrowLeft" && input.folderExpanded === true) return { type: "collapse" };
	if (input.key === "Enter" || input.key === " ") return { type: "activate" };
	return { type: "none" };
}
