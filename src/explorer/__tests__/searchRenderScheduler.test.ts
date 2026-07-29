import { SearchRenderScheduler } from "../searchRenderScheduler";

function makeFakeTimerHost() {
	let nextId = 1;
	const callbacks = new Map<number, () => void>();
	const host = {
		setTimeout: jest.fn((callback: () => void, _delay: number) => {
			const id = nextId++;
			callbacks.set(id, callback);
			return id;
		}),
		clearTimeout: jest.fn((id: number) => {
			callbacks.delete(id);
		}),
	};

	return {
		host,
		runAll() {
			const pending = Array.from(callbacks.values());
			callbacks.clear();
			pending.forEach((callback) => callback());
		},
	};
}

describe("SearchRenderScheduler", () => {
	it("runs only the latest scheduled render", () => {
		const timer = makeFakeTimerHost();
		const scheduler = new SearchRenderScheduler(timer.host);
		const first = jest.fn();
		const second = jest.fn();

		scheduler.schedule(first);
		scheduler.schedule(second);
		timer.runAll();

		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledTimes(1);
		expect(timer.host.setTimeout).toHaveBeenLastCalledWith(
			expect.any(Function),
			200,
		);
	});

	it("does not run a cancelled render", () => {
		const timer = makeFakeTimerHost();
		const scheduler = new SearchRenderScheduler(timer.host);
		const render = jest.fn();

		scheduler.schedule(render);
		scheduler.cancel();
		timer.runAll();

		expect(render).not.toHaveBeenCalled();
	});
});
