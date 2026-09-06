//================================================================
// Yandex Mail checker - Manifest V3 service worker
//================================================================
import { analyzeHTML, checkEmailURL, emailURL, matchPattern } from "./edition.js";

const ALARM_NAME = "checkMail";
const NEVER_INTERVAL = 0x7fffffff;
const REQUEST_TIMEOUT_MS = 50000;
const DOUBLE_CLICK_MS = 1000;

const DEFAULT_PREFERENCE = {
	lang: "auto",
	site: 0,
	inbox: true,
	interval: 30,
	showToolbarNumber: true,
	showPopup: true,
	resetCounter: true,
	reUseExistingMailTab: true,
	openBehavior: 1,
};

const CHECKING_COLOR = [60, 120, 216, 255];
const BADGE_COLOR = [211, 47, 47, 255];
const AVAILABLE_LANGS = ["en", "ru"];

// In-memory (non-persistent) state.
let colorIcons = null;
let grayIcons = null;
let checking = false;
let firstClickTime = 0;
let clickTimer = null;
let i18nMessages = {};
let i18nLang = null;


//================================================
// Preferences (chrome.storage.local)
//================================================
// Merge stored settings over defaults; persist defaults on first run.
async function getPreference() {
	const { preference } = await chrome.storage.local.get("preference");
	const merged = { ...DEFAULT_PREFERENCE, ...(preference ?? {}) };
	if (!preference) {
		await chrome.storage.local.set({ preference: merged });
	}
	return merged;
}


//================================================
// Localization (locale chosen in settings)
//================================================
// Map the stored language ("auto"/"en"/"ru") to a concrete supported locale.
function resolveLang(prefs) {
	let lang = prefs?.lang || "auto";
	if (lang === "auto") {
		const ui = (chrome.i18n.getUILanguage?.() || "en").toLowerCase();
		lang = ui.startsWith("ru") ? "ru" : "en";
	}
	return AVAILABLE_LANGS.includes(lang) ? lang : "en";
}

// Fetch the chosen locale's messages once; skip if already loaded for that lang.
async function loadMessages(prefs) {
	const lang = resolveLang(prefs);
	if (i18nLang === lang) { return; }
	try {
		const response = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
		i18nMessages = await response.json();
		i18nLang = lang;
	} catch {
		// Keep whatever messages we already had.
	}
}

// Look up a localized string with chrome.i18n-style placeholder substitution.
function t(key, subs) {
	const entry = i18nMessages[key];
	if (!entry?.message) {
		try { return chrome.i18n.getMessage(key, subs) || key; } catch { return key; }
	}
	let text = entry.message;
	if (entry.placeholders) {
		for (const [name, def] of Object.entries(entry.placeholders)) {
			text = text.replace(new RegExp(`\\$${name}\\$`, "gi"), def.content ?? "");
		}
	}
	const args = subs == null ? [] : Array.isArray(subs) ? subs : [subs];
	text = text.replace(/\$(\d+)/g, (_, n) => args[Number(n) - 1] ?? "");
	return text;
}


//================================================
// Icons
//================================================
// Build ImageData from PNG files. setIcon with imageData is reliable in a
// service worker, unlike setIcon with a path which can fail to fetch.
async function loadIconSet(grayscale) {
	const sources = { 19: "icons/c19.png", 38: "icons/c38.png" };
	const entries = await Promise.all(
		[19, 38].map(async (size) => {
			const response = await fetch(chrome.runtime.getURL(sources[size]));
			const blob = await response.blob();
			const bitmap = await createImageBitmap(blob);
			const canvas = new OffscreenCanvas(size, size);
			const ctx = canvas.getContext("2d");
			ctx.drawImage(bitmap, 0, 0, size, size);
			const imageData = ctx.getImageData(0, 0, size, size);
			if (grayscale) {
				const { data } = imageData;
				for (let i = 0; i < data.length; i += 4) {
					const gray = Math.round(0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]);
					data[i] = data[i + 1] = data[i + 2] = gray;
				}
			}
			return [size, imageData];
		})
	);
	return Object.fromEntries(entries);
}

// Cached color icon set (shown when logged in / has mail).
async function getColorIcons() {
	colorIcons ??= await loadIconSet(false);
	return colorIcons;
}

// Cached grayscale icon set (shown when logged out / error states).
async function getGrayIcons() {
	grayIcons ??= await loadIconSet(true);
	return grayIcons;
}

// Swap the toolbar icon between the color (active) and gray (inactive) sets.
async function setActionIcon(active) {
	try {
		const icons = active ? await getColorIcons() : await getGrayIcons();
		await chrome.action.setIcon({ imageData: { 19: icons[19], 38: icons[38] } });
	} catch {
		// Ignore transient icon-loading failures.
	}
}


//================================================
// Apply status to the toolbar action
//================================================
// Localized prefix used in every toolbar tooltip (e.g. "Yandex Mail").
function mailLabel() {
	return t("email") || "Yandex Mail";
}

// Show a transient "checking" indicator (blue badge + tooltip).
function setChecking() {
	chrome.action.setTitle({ title: `${mailLabel()}: ${t("statusChecking")}` });
	chrome.action.setBadgeBackgroundColor({ color: CHECKING_COLOR });
	chrome.action.setBadgeText({ text: "…" });
}

// Render the toolbar icon, badge and tooltip for a given check result.
function applyState(state, count, prefs) {
	const label = mailLabel();
	chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });

	switch (state) {
		case "unread":
			setActionIcon(true);
			chrome.action.setBadgeText({ text: prefs?.showToolbarNumber && count > 0 ? String(count) : "" });
			chrome.action.setTitle({ title: `${label}: ${t("statusUnread", [String(count)])}` });
			break;
		case "empty":
			setActionIcon(true);
			chrome.action.setBadgeText({ text: "" });
			chrome.action.setTitle({ title: `${label}: ${t("statusEmpty")}` });
			break;
		case "loggedout":
			setActionIcon(false);
			chrome.action.setBadgeText({ text: "" });
			chrome.action.setTitle({ title: `${label}: ${t("statusLoggedOut")}` });
			break;
		case "disconnected":
			setActionIcon(false);
			chrome.action.setBadgeText({ text: "" });
			chrome.action.setTitle({ title: `${label}: ${t("statusDisconnected")}` });
			break;
		case "timeout":
			setActionIcon(false);
			chrome.action.setBadgeText({ text: "" });
			chrome.action.setTitle({ title: `${label}: ${t("statusTimeout")}` });
			break;
		default:
			setActionIcon(false);
			chrome.action.setBadgeText({ text: "?" });
			chrome.action.setTitle({ title: `${label}: ${t("statusUnknown")}` });
			break;
	}
}


//================================================
// Check email
//================================================
// Fetch a URL as text with credentials and an abortable timeout.
async function fetchText(method, url, body) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);
	const options = { method, credentials: "include", redirect: "follow", signal: controller.signal };
	if (body != null) {
		options.body = body;
		options.headers = { "Content-type": "application/x-www-form-urlencoded" };
	}
	try {
		const response = await fetch(url, options);
		return await response.text();
	} finally {
		clearTimeout(timer);
	}
}

// Follow the lite-inbox request/redirect chain and parse the unread count.
async function fetchUnreadCount(prefs) {
	let method = "GET";
	let url = checkEmailURL[prefs.site];
	let body = null;

	for (let step = 0; step <= 5; step++) {
		const text = await fetchText(method, url, body);
		const result = analyzeHTML(text, prefs.inbox);
		if (typeof result === "number" && !Number.isNaN(result)) {
			return result;
		}
		const [verb, redirectURL, ...rest] = String(result).split(" ");
		if (verb === "GET") {
			method = "GET";
			url = redirectURL;
			body = null;
		} else if (verb === "POST") {
			method = "POST";
			url = redirectURL;
			body = rest.join(" ");
		} else {
			return -1;
		}
	}
	return -1;
}

// Run a single mail check and reflect the result on the toolbar icon.
async function checkNow() {
	if (checking) { return; }
	checking = true;

	let prefs;
	try {
		prefs = await getPreference();
		await loadMessages(prefs);
		setChecking();
		const count = await fetchUnreadCount(prefs);
		if (count === -3) {
			applyState("disconnected", 0, prefs);
		} else if (count === -2) {
			applyState("loggedout", 0, prefs);
		} else if (count === -1) {
			applyState("unknown", 0, prefs);
		} else if (count === 0) {
			applyState("empty", 0, prefs);
		} else {
			applyState("unread", count, prefs);
		}
	} catch (error) {
		const timedOut = error === "timeout" || error?.name === "AbortError";
		applyState(timedOut ? "timeout" : "disconnected", 0, prefs);
	} finally {
		checking = false;
	}
}


//================================================
// Open mail
//================================================
// openMode: 0 = current tab, 1 = new/active tab, 2 = new background tab.
async function openURL(targetURL, openMode) {
	if (openMode === 0) {
		const tabs = await chrome.tabs.query({ windowType: "normal", active: true, lastFocusedWindow: true });
		if (tabs.length > 0) {
			await chrome.tabs.update(tabs[0].id, { url: targetURL, active: true });
		} else {
			await openURL(targetURL, 1);
		}
	} else if (openMode === 1) {
		const tabs = await chrome.tabs.query({ windowType: "normal", active: true, lastFocusedWindow: true });
		if (tabs.length > 0 && tabs[0].url === "chrome://newtab/") {
			await chrome.tabs.update(tabs[0].id, { url: targetURL, active: true });
		} else {
			await chrome.tabs.create({ url: targetURL, active: true });
		}
	} else {
		await chrome.tabs.create({ url: targetURL, active: false });
	}
}

// Clear the badge right after opening mail, if the user enabled that option.
function resetCounterOnOpen(prefs) {
	if (prefs.resetCounter) {
		chrome.action.setBadgeText({ text: "" });
		setActionIcon(true);
		chrome.action.setTitle({ title: `${mailLabel()}: No unread email` });
	}
}

// Open Yandex Mail, optionally reusing an existing mail tab first.
async function openMail() {
	const prefs = await getPreference();
	await loadMessages(prefs);
	if (prefs.reUseExistingMailTab) {
		const tabs = await chrome.tabs.query({ windowType: "normal", url: matchPattern[prefs.site] });
		if (tabs.length > 0) {
			const tab = await chrome.tabs.update(tabs[0].id, { active: true });
			if (tab) { await chrome.windows.update(tab.windowId, { focused: true }); }
			resetCounterOnOpen(prefs);
			return;
		}
	}
	await openURL(emailURL[prefs.site], prefs.openBehavior);
	resetCounterOnOpen(prefs);
}


//================================================
// Scheduling
//================================================
// Force recreate (used when the interval setting changes).
async function rescheduleAlarm(prefs) {
	await chrome.alarms.clear(ALARM_NAME);
	if (prefs.interval !== NEVER_INTERVAL) {
		chrome.alarms.create(ALARM_NAME, { periodInMinutes: Math.max(1, prefs.interval) });
	}
}

// Create only if missing, so frequent service worker wakeups don't reset the countdown.
async function ensureAlarm(prefs) {
	if (prefs.interval === NEVER_INTERVAL) {
		await chrome.alarms.clear(ALARM_NAME);
		return;
	}
	const existing = await chrome.alarms.get(ALARM_NAME);
	if (!existing) {
		chrome.alarms.create(ALARM_NAME, { periodInMinutes: Math.max(1, prefs.interval) });
	}
}

// Enable the popup menu, or clear it so clicks go to onClicked (single/double).
function applyPopupSetting(prefs) {
	chrome.action.setPopup({ popup: prefs.showPopup ? "html/popup.html" : "" });
}

// Apply settings, ensure the alarm exists and run an initial check.
async function initialize() {
	const prefs = await getPreference();
	applyPopupSetting(prefs);
	await ensureAlarm(prefs);
	checkNow();
}


//================================================
// Listeners
//================================================
chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);

chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === ALARM_NAME) { checkNow(); }
});

chrome.action.onClicked.addListener(() => {
	// Only fires when no popup is set (single/double click mode).
	if (firstClickTime === 0) {
		firstClickTime = Date.now();
		clickTimer = setTimeout(() => {
			firstClickTime = 0;
			openMail();
		}, DOUBLE_CLICK_MS);
	} else {
		clearTimeout(clickTimer);
		firstClickTime = 0;
		checkNow();
	}
});

chrome.runtime.onMessage.addListener((message) => {
	switch (message?.type) {
		case "openMail":
			openMail();
			break;
		case "checkNow":
			checkNow();
			break;
		case "prefsUpdated":
			getPreference().then((prefs) => {
				applyPopupSetting(prefs);
				rescheduleAlarm(prefs);
				checkNow();
			});
			break;
	}
	return false;
});

// Run once when the service worker is first loaded.
initialize();
