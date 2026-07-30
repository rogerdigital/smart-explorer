const SEARCH_RENDER_DELAY_MS = 200;

export type TimerHost = {
	setTimeout(callback: () => void, delay: number): number;
	clearTimeout(handle: number): void;
};

export class SearchRenderScheduler {
	private timer: number | null = null;

	constructor(private readonly timerHost: TimerHost = activeWindow) {}

	schedule(render: () => void) {
		this.cancel();
		this.timer = this.timerHost.setTimeout(() => {
			this.timer = null;
			render();
		}, SEARCH_RENDER_DELAY_MS);
	}

	cancel() {
		if (this.timer === null) return;
		this.timerHost.clearTimeout(this.timer);
		this.timer = null;
	}
}
