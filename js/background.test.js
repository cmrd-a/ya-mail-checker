import { jest } from '@jest/globals';
import { chrome } from 'jest-chrome';

global.chrome = chrome;

// Specifically mock things that background.js expects at the top level
global.chrome.action = {
    onClicked: { addListener: jest.fn() },
    setTitle: jest.fn(),
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
    setIcon: jest.fn(),
    setPopup: jest.fn()
};
global.chrome.alarms = {
    onAlarm: { addListener: jest.fn() },
    create: jest.fn(),
    clear: jest.fn(),
    get: jest.fn().mockResolvedValue(null)
};
global.chrome.storage = {
    local: {
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue()
    }
};
global.chrome.runtime = {
    onMessage: { addListener: jest.fn() },
    getURL: jest.fn().mockReturnValue('chrome-extension://id/'),
    onInstalled: { addListener: jest.fn() },
    onStartup: { addListener: jest.fn() },
};

global.chrome.contextMenus = {
    create: jest.fn(),
    removeAll: jest.fn(),
    onClicked: { addListener: jest.fn() }
};

global.chrome.offscreen = {
    hasDocument: jest.fn().mockResolvedValue(false),
    createDocument: jest.fn().mockResolvedValue(),
    closeDocument: jest.fn().mockResolvedValue()
};

// Let jest use fake timers
jest.useFakeTimers();

// Import background.js
const bg = await import('./background.js');

describe('fetchText', () => {
    let fetchMock;

    beforeEach(() => {
        fetchMock = jest.fn();
        global.fetch = fetchMock;
        jest.clearAllMocks();
    });

    it('should abort and throw when fetch response exceeds REQUEST_TIMEOUT_MS', async () => {
        // Setup a fetch mock that will take longer than REQUEST_TIMEOUT_MS to resolve,
        // and throws if the abort signal is triggered.
        fetchMock.mockImplementation((url, options) => {
            return new Promise((resolve, reject) => {
                const onAbort = () => {
                    reject(new Error(options.signal.reason || 'AbortError'));
                };

                if (options.signal.aborted) {
                    return onAbort();
                }

                options.signal.addEventListener('abort', onAbort);
            });
        });

        // Start fetchText
        const fetchTextPromise = bg.fetchText('GET', 'http://example.com');

        // Fast forward time by exactly the timeout
        jest.advanceTimersByTime(bg.REQUEST_TIMEOUT_MS);

        // Await the promise to verify it rejects
        await expect(fetchTextPromise).rejects.toThrow('timeout');

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should clear the timeout if fetch succeeds before REQUEST_TIMEOUT_MS', async () => {
        const mockResponse = {
            text: jest.fn().mockResolvedValue('success text')
        };
        fetchMock.mockResolvedValue(mockResponse);

        const fetchTextPromise = bg.fetchText('GET', 'http://example.com');

        // Await resolution immediately
        const result = await fetchTextPromise;
        expect(result).toBe('success text');

        // Ensure no timeouts are left pending
        expect(jest.getTimerCount()).toBe(0);
    });
});
