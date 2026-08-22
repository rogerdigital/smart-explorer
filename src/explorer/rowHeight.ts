const LIST_ROW_HEIGHT_DESKTOP = 44;
const LIST_ROW_HEIGHT_MOBILE = 52;

export function getListRowHeight(isMobile: boolean): number {
	return isMobile ? LIST_ROW_HEIGHT_MOBILE : LIST_ROW_HEIGHT_DESKTOP;
}
