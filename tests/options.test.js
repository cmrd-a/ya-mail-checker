/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import { chrome } from 'jest-chrome';

Object.assign(globalThis, { chrome });

let mockPrefs = {
    lang: "en",
    site: 0,
    inbox: true,
    interval: 30,
    showToolbarNumber: true,
    showPopup: true,
    resetCounter: false,
    reUseExistingMailTab: true,
    openBehavior: 1,
    showOnlyUnreadInPopup: true,
    enableNotifications: true,
    notificationSound: "default",
    flashIconOnNewMail: true,
    quietHoursEnabled: false,
    quietHoursStart: "23:00",
    quietHoursEnd: "07:00",
};

jest.unstable_mockModule('../js/preferences.js', () => ({
    getPreference: jest.fn().mockImplementation(() => Promise.resolve(mockPrefs)),
    DEFAULT_PREFERENCE: {}
}));

jest.unstable_mockModule('../js/edition.js', () => ({
    siteNames: ['yandex.com', 'yandex.ru']
}));

global.I18N = {
    getMessage: jest.fn((key) => `Msg:${key}`),
    ready: Promise.resolve(),
    reload: jest.fn().mockResolvedValue()
};

describe('options.js', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
            <select id="lang"><option value="en"></option></select>
            <div id="siteList"></div>
            <input type="checkbox" id="inbox" />
            <input type="checkbox" id="showOnlyUnreadInPopup" />
            <input type="range" id="autoCheckRange" min="1" max="181" step="1" />
            <div id="autoCheckText"></div>
            <input type="checkbox" id="showToolbarNumber" />
            <input type="radio" id="showPopup" name="iconClick" />
            <input type="radio" id="noPopup" name="iconClick" />
            <input type="checkbox" id="resetCounter" />
            <input type="checkbox" id="reUseExistingMailTab" />
            <input type="radio" id="openEmailInCurrentTab" name="openBehavior" />
            <input type="radio" id="openEmailInNewTab" name="openBehavior" />
            <input type="radio" id="openEmailInNewBackgroundTab" name="openBehavior" />
            <input type="checkbox" id="enableNotifications" />
            <input type="checkbox" id="flashIconOnNewMail" />
            <select id="notificationSound"><option value="default"></option></select>
            <input type="checkbox" id="quietHoursEnabled" />
            <input type="time" id="quietHoursStart" />
            <input type="time" id="quietHoursEnd" />
            <div id="quietHoursRow"></div>
            <h1 id="name"></h1>
            <div id="aboutName"></div>
            <div id="aboutVersion"></div>
            <button id="save"></button>
            <span id="status"></span>
        `;
        chrome.runtime.getManifest.mockReturnValue({ version: '1.0.0' });
        chrome.storage.local.set.mockClear();
        chrome.runtime.sendMessage.mockClear();

        jest.useRealTimers();
    });

    beforeAll(async () => {
        await import('../js/options.js');
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('loads and initializes form', async () => {
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise(process.nextTick);

        expect(document.getElementById('inbox').checked).toBe(true);
        expect(document.getElementById('autoCheckRange').value).toBe("30");
        expect(document.getElementById('showPopup').checked).toBe(true);
        expect(document.getElementById('site0').checked).toBe(true);
        expect(document.getElementById('aboutVersion').textContent).toBe('Msg:versionLabel');
        expect(document.getElementById('quietHoursStart').disabled).toBe(true);
        expect(document.getElementById('quietHoursRow').classList.contains('disabled')).toBe(true);
    });

    it('updates auto check text when range changes', async () => {
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise(process.nextTick);

        const range = document.getElementById('autoCheckRange');

        range.value = "60";
        range.dispatchEvent(new Event('input'));

        range.value = "181";
        range.dispatchEvent(new Event('input'));
        expect(document.getElementById('autoCheckText').textContent).toBe('Msg:checkEvery');

        document.getElementById('save').click();

        await new Promise(process.nextTick);
        await new Promise(process.nextTick);

        expect(chrome.storage.local.set).toHaveBeenCalledWith({
            preference: expect.objectContaining({
                interval: 2147483647
            })
        });
    });

    it('updates quiet hours disabled state when toggled', async () => {
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise(process.nextTick);

        const toggle = document.getElementById('quietHoursEnabled');

        toggle.checked = true;
        toggle.dispatchEvent(new Event('change'));
        expect(document.getElementById('quietHoursStart').disabled).toBe(false);
        expect(document.getElementById('quietHoursRow').classList.contains('disabled')).toBe(false);

        toggle.checked = false;
        toggle.dispatchEvent(new Event('change'));
        expect(document.getElementById('quietHoursStart').disabled).toBe(true);
        expect(document.getElementById('quietHoursRow').classList.contains('disabled')).toBe(true);
    });

    it('saves form correctly with various openBehaviors', async () => {
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise(process.nextTick);

        document.getElementById('openEmailInCurrentTab').checked = true;
        document.getElementById('save').click();
        await new Promise(process.nextTick);
        await new Promise(process.nextTick);
        expect(chrome.storage.local.set).toHaveBeenCalledWith({
            preference: expect.objectContaining({ openBehavior: 0 })
        });

        chrome.storage.local.set.mockClear();

        document.getElementById('openEmailInNewBackgroundTab').checked = true;
        document.getElementById('save').click();
        await new Promise(process.nextTick);
        await new Promise(process.nextTick);
        expect(chrome.storage.local.set).toHaveBeenCalledWith({
            preference: expect.objectContaining({ openBehavior: 2 })
        });
    });

    it('handles missing enableNotifications properly', async () => {
        document.getElementById('enableNotifications').remove();

        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise(process.nextTick);

        document.getElementById('save').click();
        await new Promise(process.nextTick);
        await new Promise(process.nextTick);

        expect(chrome.storage.local.set).toHaveBeenCalledWith({
            preference: expect.objectContaining({
                enableNotifications: true
            })
        });
    });

    it('clears status text after save', async () => {
        jest.useFakeTimers();

        document.dispatchEvent(new Event('DOMContentLoaded'));
        for(let i=0; i<5; i++) await Promise.resolve();

        document.getElementById('save').click();
        for(let i=0; i<10; i++) await Promise.resolve();

        expect(document.getElementById('status').textContent).toBe('Msg:saved');

        jest.advanceTimersByTime(1500);
        expect(document.getElementById('status').textContent).toBe('');
    });
});
