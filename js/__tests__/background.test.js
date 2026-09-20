import { jest } from '@jest/globals';
import { resolveLang } from '../background.js';

describe('resolveLang', () => {
    let originalGetUILanguage;

    beforeEach(() => {
        // Keep the global chrome from jest.setup.js and just spy on the specific method
        originalGetUILanguage = global.chrome.i18n.getUILanguage;
        global.chrome.i18n.getUILanguage = jest.fn();
    });

    afterEach(() => {
        global.chrome.i18n.getUILanguage = originalGetUILanguage;
        jest.resetModules();
    });

    it('returns "en" when lang is "en"', () => {
        const prefs = { lang: 'en' };
        expect(resolveLang(prefs)).toBe('en');
    });

    it('returns "ru" when lang is "ru"', () => {
        const prefs = { lang: 'ru' };
        expect(resolveLang(prefs)).toBe('ru');
    });

    it('falls back to "en" for unsupported languages', () => {
        const prefs = { lang: 'fr' };
        expect(resolveLang(prefs)).toBe('en');
    });

    it('defaults to "auto" and resolves to "en" when chrome.i18n is not ru', () => {
        const prefs = {};
        global.chrome.i18n.getUILanguage.mockReturnValue('en-US');
        expect(resolveLang(prefs)).toBe('en');
    });

    it('defaults to "auto" and resolves to "ru" when chrome.i18n starts with ru', () => {
        const prefs = {};
        global.chrome.i18n.getUILanguage.mockReturnValue('ru-RU');
        expect(resolveLang(prefs)).toBe('ru');
    });

    it('defaults to "auto" and resolves to "ru" when chrome.i18n is ru', () => {
        const prefs = { lang: 'auto' };
        global.chrome.i18n.getUILanguage.mockReturnValue('ru');
        expect(resolveLang(prefs)).toBe('ru');
    });

    it('handles missing chrome.i18n.getUILanguage method gracefully', () => {
        const prefs = { lang: 'auto' };
        global.chrome.i18n.getUILanguage = undefined;
        expect(resolveLang(prefs)).toBe('en');
    });

    it('handles null preferences', () => {
        global.chrome.i18n.getUILanguage = jest.fn().mockReturnValue('ru-RU');
        expect(resolveLang(null)).toBe('ru');
    });
});
