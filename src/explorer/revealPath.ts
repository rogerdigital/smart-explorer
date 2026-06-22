export function revealPathInContainer(container: HTMLElement, path: string): boolean {
	const target = Array.from(container.querySelectorAll<HTMLElement>("[data-path]"))
		.find((element) => element.dataset.path === path);
	if (!target) return false;
	target.scrollIntoView({ block: "nearest" });
	return true;
}
