export const DEFAULT_PREFERENCE = {
	lang: "auto",
	site: 3,
	inbox: true,
	interval: 30,
	showToolbarNumber: true,
	showPopup: true,
	resetCounter: false,
	reUseExistingMailTab: true,
	openBehavior: 1,
	enableNotifications: true,
};

export async function getPreference() {
	const { preference } = await chrome.storage.local.get("preference");
	const merged = { ...DEFAULT_PREFERENCE, ...(preference ?? {}) };
	if (!preference) {
		await chrome.storage.local.set({ preference: merged });
	}
	return merged;
}
