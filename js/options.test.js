const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.resolve(__dirname, "../html/options.html"), "utf8");

// Use process.nextTick for flushing promises since setImmediate isn't natively supported in all jsdom envs without polyfill
const flushPromises = () => new Promise(resolve => process.nextTick(resolve));

global.chrome = {
	storage: {
		local: {
			get: jest.fn(),
			set: jest.fn(),
		},
	},
	runtime: {
		sendMessage: jest.fn(),
		getManifest: jest.fn(() => ({ version: "1.0.0" })),
	},
};

global.I18N = {
	getMessage: jest.fn((key, subs) => {
		if (key === "name") return "Yandex Mail Checker";
		if (key === "versionLabel") return `Version ${subs[0]}`;
		if (key === "never") return "Never";
		if (key === "hoursShort") return "h";
		if (key === "minutesShort") return "m";
		if (key === "checkEvery") return `Check every ${subs[0]}`;
		if (key === "saved") return "Saved successfully";
		return key;
	}),
	ready: Promise.resolve(),
	reload: jest.fn(),
};

describe("options.js", () => {
	beforeEach(() => {
		// Reset DOM
		document.documentElement.innerHTML = html.toString();

		// Reset mocks
		jest.clearAllMocks();

		global.chrome.storage.local.get.mockResolvedValue({ preference: {} });
		global.chrome.storage.local.set.mockResolvedValue();
		global.I18N.reload.mockResolvedValue();

		const scriptContent = fs.readFileSync(path.resolve(__dirname, "options.js"), "utf8");
		// Assign functions to global (window) to make them accessible
		eval(`
			${scriptContent};
			window.saveForm = saveForm;
		`);
	});

	describe("Initialization and Rendering", () => {
		it("should render the site list correctly", async () => {
			document.dispatchEvent(new Event("DOMContentLoaded"));
			await flushPromises();

			const siteList = document.getElementById("siteList");
			expect(siteList.children.length).toBe(6);
			expect(document.getElementById("site0").checked).toBe(false);
			expect(document.getElementById("site3").checked).toBe(true);
		});

		it("should populate the form with default preferences", async () => {
			document.dispatchEvent(new Event("DOMContentLoaded"));
			await flushPromises();

			expect(document.getElementById("lang").value).toBe("auto");
			expect(document.getElementById("site3").checked).toBe(true);
			expect(document.getElementById("inbox").checked).toBe(true);
			expect(document.getElementById("autoCheckRange").value).toBe("30");
			expect(document.getElementById("showToolbarNumber").checked).toBe(true);
			expect(document.getElementById("showPopup").checked).toBe(true);
			expect(document.getElementById("resetCounter").checked).toBe(false);
			expect(document.getElementById("reUseExistingMailTab").checked).toBe(true);
			expect(document.getElementById("openEmailInNewTab").checked).toBe(true);
			expect(document.getElementById("enableNotifications").checked).toBe(true);
		});

		it("should populate the form with stored preferences", async () => {
			chrome.storage.local.get.mockResolvedValue({
				preference: {
					lang: "en",
					site: 1,
					inbox: false,
					interval: 65,
					showToolbarNumber: false,
					showPopup: false,
					resetCounter: true,
					reUseExistingMailTab: false,
					openBehavior: 0,
					enableNotifications: false,
				}
			});

			document.dispatchEvent(new Event("DOMContentLoaded"));
			await flushPromises();
			await flushPromises(); // Give it an extra tick to be safe

			expect(document.getElementById("lang").value).toBe("en");
			expect(document.getElementById("site1").checked).toBe(true);
			expect(document.getElementById("inbox").checked).toBe(false);
			expect(document.getElementById("autoCheckRange").value).toBe("65");
			expect(document.getElementById("showToolbarNumber").checked).toBe(false);
			expect(document.getElementById("noPopup").checked).toBe(true);
			expect(document.getElementById("resetCounter").checked).toBe(true);
			expect(document.getElementById("reUseExistingMailTab").checked).toBe(false);
			expect(document.getElementById("openEmailInCurrentTab").checked).toBe(true);
			expect(document.getElementById("enableNotifications").checked).toBe(false);

			expect(document.getElementById("autoCheckText").textContent).toBe("Check every 1 h 5 m");
		});

		it("should handle NEVER_INTERVAL correctly", async () => {
			chrome.storage.local.get.mockResolvedValue({
				preference: {
					interval: 0x7fffffff,
				}
			});

			document.dispatchEvent(new Event("DOMContentLoaded"));
			await flushPromises();
			await flushPromises();

			expect(document.getElementById("autoCheckRange").value).toBe("181");
			expect(document.getElementById("autoCheckText").textContent).toBe("Check every Never");
		});

		it("should apply dynamic texts correctly", async () => {
			document.dispatchEvent(new Event("DOMContentLoaded"));
			await flushPromises();

			expect(document.getElementById("name").textContent).toBe("Yandex Mail Checker");
			expect(document.getElementById("aboutName").textContent).toBe("Yandex Mail Checker");
			expect(document.getElementById("aboutVersion").textContent).toBe("Version 1.0.0");
			expect(document.getElementById("autoCheckText").textContent).toBe("Check every 30 m");
		});
	});

	describe("Interactions and Saving", () => {
		it("should update interval text when range input changes", async () => {
			document.dispatchEvent(new Event("DOMContentLoaded"));
			await flushPromises();

			const range = document.getElementById("autoCheckRange");

			range.value = "181";
			range.dispatchEvent(new Event("input"));
			expect(document.getElementById("autoCheckText").textContent).toBe("Check every Never");

			range.value = "120";
			range.dispatchEvent(new Event("input"));
			expect(document.getElementById("autoCheckText").textContent).toBe("Check every 2 h");

			range.value = "125";
			range.dispatchEvent(new Event("input"));
			expect(document.getElementById("autoCheckText").textContent).toBe("Check every 2 h 5 m");

			range.value = "45";
			range.dispatchEvent(new Event("input"));
			expect(document.getElementById("autoCheckText").textContent).toBe("Check every 45 m");
		});

		it("should save form correctly", async () => {
			document.dispatchEvent(new Event("DOMContentLoaded"));
			await flushPromises();

			document.getElementById("lang").value = "ru";
			document.getElementById("site2").checked = true;
			document.getElementById("inbox").checked = false;
			document.getElementById("autoCheckRange").value = "181";
			document.getElementById("noPopup").checked = true;
			document.getElementById("openEmailInNewBackgroundTab").checked = true;

			document.getElementById("save").dispatchEvent(new Event("click"));
			await flushPromises();
			await flushPromises();
			await flushPromises();

			expect(chrome.storage.local.set).toHaveBeenCalledWith({
				preference: {
					lang: "ru",
					site: 2,
					inbox: false,
					interval: 0x7fffffff,
					showToolbarNumber: true,
					showPopup: false,
					resetCounter: false,
					reUseExistingMailTab: true,
					openBehavior: 2,
					enableNotifications: true,
				}
			});

			expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "prefsUpdated" });
			expect(global.I18N.reload).toHaveBeenCalled();
			expect(document.getElementById("status").textContent).toBe("Saved successfully");
		});

		it("should clear status text after timeout", async () => {
			jest.useFakeTimers();

			document.dispatchEvent(new Event("DOMContentLoaded"));
			// Manual setup isn't great with fakeTimers + promises. Let's just mock the environment and trigger saveForm

			// First, wait for initial load in real time before faking timers
			jest.useRealTimers();
			await flushPromises();

			jest.useFakeTimers();

			// Call the exported saveForm directly
			const savePromise = window.saveForm();

			// Advance microtasks to complete the async part of saveForm before setTimeout
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();

			expect(document.getElementById("status").textContent).toBe("Saved successfully");
			jest.advanceTimersByTime(1500);
			expect(document.getElementById("status").textContent).toBe("");
			jest.useRealTimers();
		});

		it("should handle openBehavior mapping correctly on read", async () => {
			document.dispatchEvent(new Event("DOMContentLoaded"));
			await flushPromises();

			const saveButton = document.getElementById("save");

			document.getElementById("openEmailInCurrentTab").checked = true;
			saveButton.dispatchEvent(new Event("click"));
			await flushPromises();
			await flushPromises();
			expect(chrome.storage.local.set.mock.calls[0][0].preference.openBehavior).toBe(0);

			chrome.storage.local.set.mockClear();

			document.getElementById("openEmailInNewTab").checked = true;
			saveButton.dispatchEvent(new Event("click"));
			await flushPromises();
			await flushPromises();
			expect(chrome.storage.local.set.mock.calls[0][0].preference.openBehavior).toBe(1);

			chrome.storage.local.set.mockClear();

			document.getElementById("openEmailInNewBackgroundTab").checked = true;
			saveButton.dispatchEvent(new Event("click"));
			await flushPromises();
			await flushPromises();
			expect(chrome.storage.local.set.mock.calls[0][0].preference.openBehavior).toBe(2);
		});

		it("should fall back to site 0 if none is selected", async () => {
			document.dispatchEvent(new Event("DOMContentLoaded"));
			await flushPromises();

			for (let i = 0; i < 6; i++) {
				document.getElementById(`site${i}`).checked = false;
			}

			document.getElementById("save").dispatchEvent(new Event("click"));
			await flushPromises();
			await flushPromises();

			expect(chrome.storage.local.set.mock.calls[0][0].preference.site).toBe(0);
		});
	});
});
