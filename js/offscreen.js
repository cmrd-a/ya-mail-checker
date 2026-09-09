//================================================================
// Offscreen page: report the browser light/dark theme to the
// service worker (which cannot call matchMedia itself).
//================================================================
"use strict";

const query = matchMedia("(prefers-color-scheme: dark)");

function reportTheme() {
	chrome.runtime.sendMessage({ type: "themeChanged", dark: query.matches }).catch(() => {
		// Service worker may be asleep; it re-reads on next wakeup.
	});
}

query.addEventListener("change", reportTheme);
reportTheme();
