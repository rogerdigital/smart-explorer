export const TOUCH_LONG_PRESS_MS = 500;
export const TOUCH_MOVE_THRESHOLD_PX = 10;

export function isTouchMovePastThreshold(
	startX: number,
	startY: number,
	currentX: number,
	currentY: number,
	threshold = TOUCH_MOVE_THRESHOLD_PX,
): boolean {
	const dx = currentX - startX;
	const dy = currentY - startY;
	return Math.sqrt(dx * dx + dy * dy) > threshold;
}
