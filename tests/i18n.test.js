/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

describe('I18N', () => {
    let originalChrome;
    let originalFetch;
    let mockStorageGet;
    let mockGetUILanguage;
    let mockGetMessage;
    let mockFetch;

    beforeEach(() => {
        originalChrome = global.chrome;
        originalFetch = global.fetch;

        mockStorageGet = jest.fn().mockResolvedValue({});
        mockGetUILanguage = jest.fn().mockReturnValue('en');
        mockGetMessage = jest.fn((key) => key);

        global.chrome = {
            storage: {
                local: {
                    get: mockStorageGet
                }
            },
            i18n: {
                getUILanguage: mockGetUILanguage,
                getMessage: mockGetMessage
            },
            runtime: {
                getURL: jest.fn(path => `chrome-extension://1234/${path}`)
            }
        };

        mockFetch = jest.fn().mockResolvedValue({
            json: jest.fn().mockResolvedValue({})
        });
        global.fetch = mockFetch;

        document.body.innerHTML = '';
        jest.resetModules();
    });

    afterEach(() => {
        global.chrome = originalChrome;
        global.fetch = originalFetch;
        jest.clearAllMocks();
    });

    const loadI18n = async () => {
        const module = await import('../js/i18n.js');
        await module.I18N.ready;
        await new Promise(process.nextTick);
        return module.I18N;
    };

    describe('Language Resolution', () => {
        it('defaults to English when storage is empty and UI language is English', async () => {
            await loadI18n();
            expect(mockFetch).toHaveBeenCalledWith('chrome-extension://1234/_locales/en/messages.json');
        });

        it('loads Russian when UI language starts with ru', async () => {
            mockGetUILanguage.mockReturnValue('ru-RU');
            await loadI18n();
            expect(mockFetch).toHaveBeenCalledWith('chrome-extension://1234/_locales/ru/messages.json');
        });

        it('loads user preferred language from storage over UI language', async () => {
            mockStorageGet.mockResolvedValue({ preference: { lang: 'ru' } });
            mockGetUILanguage.mockReturnValue('en-US');
            await loadI18n();
            expect(mockFetch).toHaveBeenCalledWith('chrome-extension://1234/_locales/ru/messages.json');
        });

        it('falls back to "auto" if storage throws, then uses UI language', async () => {
            mockStorageGet.mockRejectedValue(new Error('Storage error'));
            mockGetUILanguage.mockReturnValue('ru');
            await loadI18n();
            expect(mockFetch).toHaveBeenCalledWith('chrome-extension://1234/_locales/ru/messages.json');
        });

        it('falls back to "en" if resolved language is not available', async () => {
            mockStorageGet.mockResolvedValue({ preference: { lang: 'fr' } });
            await loadI18n();
            expect(mockFetch).toHaveBeenCalledWith('chrome-extension://1234/_locales/en/messages.json');
        });
    });

    describe('Error Handling', () => {
        it('falls back to English if loading preferred locale fails', async () => {
            mockStorageGet.mockResolvedValue({ preference: { lang: 'ru' } });
            mockFetch.mockImplementation(async (url) => {
                if (url.includes('/ru/')) throw new Error('Network error');
                return { json: async () => ({ "key": { "message": "en_fallback" } }) };
            });

            const I18N = await loadI18n();
            expect(I18N.getMessage('key')).toBe('en_fallback');
            expect(mockFetch).toHaveBeenCalledTimes(2); // First ru, then en
        });

        it('returns empty dictionary if falling back to English also fails', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));
            const I18N = await loadI18n();
            // Missing keys fall back to chrome.i18n.getMessage or just the key
            expect(I18N.getMessage('missing_key')).toBe('missing_key');
        });
    });

    describe('Message Parsing', () => {
        beforeEach(() => {
            mockFetch.mockResolvedValue({
                json: async () => ({
                    "simple": { "message": "Hello" },
                    "with_placeholders": {
                        "message": "Hello $NAME$! Your balance is $AMOUNT$.",
                        "placeholders": {
                            "name": { "content": "$1" },
                            "amount": { "content": "$2" }
                        }
                    },
                    "missing_content": {
                        "message": "Hi $NAME$",
                        "placeholders": {
                            "name": {} // missing content
                        }
                    }
                })
            });
        });

        it('returns simple message without substitutions', async () => {
            const I18N = await loadI18n();
            expect(I18N.getMessage('simple')).toBe('Hello');
        });

        it('substitutes numbered arguments via placeholders', async () => {
            const I18N = await loadI18n();
            expect(I18N.getMessage('with_placeholders', ['Alice', '500'])).toBe('Hello Alice! Your balance is 500.');
        });

        it('handles single substitution argument (not array)', async () => {
            const I18N = await loadI18n();
            expect(I18N.getMessage('with_placeholders', 'Alice')).toBe('Hello Alice! Your balance is .');
        });

        it('handles missing placeholder content gracefully', async () => {
            const I18N = await loadI18n();
            expect(I18N.getMessage('missing_content', 'Alice')).toBe('Hi ');
        });

        it('falls back to chrome.i18n.getMessage if key is not found', async () => {
            const I18N = await loadI18n();
            mockGetMessage.mockReturnValue('Chrome message');
            expect(I18N.getMessage('unknown_key')).toBe('Chrome message');
        });

        it('falls back to key if chrome.i18n.getMessage throws', async () => {
            const I18N = await loadI18n();
            mockGetMessage.mockImplementation(() => { throw new Error('i18n error'); });
            expect(I18N.getMessage('unknown_key')).toBe('unknown_key');
        });
    });

    describe('DOM Localization', () => {
        beforeEach(() => {
            mockFetch.mockResolvedValue({
                json: async () => ({
                    "title": { "message": "My Extension" },
                    "submit": { "message": "Send" }
                })
            });
        });

        it('populates data-i18n and data-i18n-value attributes', async () => {
            document.body.innerHTML = `
                <div id="t1" data-i18n="title"></div>
                <input id="i1" data-i18n-value="submit" />
                <div id="t2" data-i18n="missing"></div>
            `;
            mockGetMessage.mockReturnValue('Missing');

            const I18N = await loadI18n();
            expect(document.getElementById('t1').textContent).toBe('My Extension');
            expect(document.getElementById('i1').value).toBe('Send');
            expect(document.getElementById('t2').textContent).toBe('Missing');
        });

        it('reloads and re-renders on I18N.reload()', async () => {
            document.body.innerHTML = `
                <div id="t1" data-i18n="title"></div>
            `;
            const I18N = await loadI18n();
            expect(document.getElementById('t1').textContent).toBe('My Extension');

            mockFetch.mockResolvedValue({
                json: async () => ({
                    "title": { "message": "Мое Расширение" }
                })
            });
            mockStorageGet.mockResolvedValue({ preference: { lang: 'ru' } });

            await I18N.reload();
            expect(document.getElementById('t1').textContent).toBe('Мое Расширение');
        });

        it('handles DOMContentLoaded event when readyState is loading', async () => {
            // Mock document.readyState to be "loading"
            const originalReadyState = document.readyState;
            Object.defineProperty(document, 'readyState', {
                get: () => 'loading',
                configurable: true
            });

            document.body.innerHTML = `<div id="t1" data-i18n="title"></div>`;
            const I18N = await loadI18n();

            // DOM shouldn't be localized yet because event hasn't fired
            expect(document.getElementById('t1').textContent).toBe('');

            // Fire event
            document.dispatchEvent(new Event('DOMContentLoaded'));

            expect(document.getElementById('t1').textContent).toBe('My Extension');

            Object.defineProperty(document, 'readyState', {
                get: () => originalReadyState,
                configurable: true
            });
        });
    });
});
