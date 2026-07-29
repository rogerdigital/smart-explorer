const SEARCH_RENDER_DELAY_MS = 200;

export class SearchRenderScheduler {
	private timer: ReturnType<typeof setTimeout> | null = null;

	schedule(render: () => void) {
		this.cancel();
		this.timer = globalThis.setTimeout(() => {
			this.timer = null;
			render();
		}, SEARCH_RENDER_DELAY_MS);
	}

	cancel() {
		if (this.timer === null) return;
		globalThis.clearTimeout(this.timer);
		this.timer = null;
	}
}
