import { SearchRenderScheduler } from "../searchRenderScheduler";

describe("SearchRenderScheduler", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("runs only the latest scheduled render", () => {
		const scheduler = new SearchRenderScheduler();
		const first = jest.fn();
		const second = jest.fn();

		scheduler.schedule(first);
		scheduler.schedule(second);
		jest.advanceTimersByTime(200);

		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledTimes(1);
	});

	it("does not run a cancelled render", () => {
		const scheduler = new SearchRenderScheduler();
		const render = jest.fn();

		scheduler.schedule(render);
		scheduler.cancel();
		jest.advanceTimersByTime(200);

		expect(render).not.toHaveBeenCalled();
	});
});
