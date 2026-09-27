/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';
import { formatAgo } from '../js/popup.js';

describe('formatAgo', () => {
    let originalDateNow;

    beforeEach(() => {
        // Mock Date.now() to return a fixed value
        originalDateNow = Date.now;
        const FIXED_TIME = 1000000000000;
        Date.now = jest.fn(() => FIXED_TIME);

        // Mock chrome global API which is used somewhere in the imported module context
        global.chrome = {
            runtime: {
                sendMessage: jest.fn(),
                openOptionsPage: jest.fn()
            }
        };

        // Mock I18N dependency globally
        global.I18N = {
            ready: Promise.resolve(),
            getMessage: jest.fn((key, args) => {
                if (key === 'justNow') return 'just now';
                if (key === 'minutesAgo') return `${args[0]}m ago`;
                if (key === 'hoursAgo') return `${args[0]}h ago`;
                return null;
            })
        };
    });

    afterEach(() => {
        Date.now = originalDateNow;
        delete global.chrome;
        delete global.I18N;
    });

    it('returns an empty string if timestamp is falsy', () => {
        expect(formatAgo(null)).toBe('');
        expect(formatAgo(undefined)).toBe('');
        expect(formatAgo(0)).toBe('');
    });

    it('returns "just now" for times less than 45 seconds ago', () => {
        const now = Date.now();
        expect(formatAgo(now)).toBe('just now');
        expect(formatAgo(now - 44000)).toBe('just now');
    });

    it('returns minutes for times between 45 seconds and 59.5 minutes ago', () => {
        const now = Date.now();
        expect(formatAgo(now - 45000)).toBe('1m ago'); // 45s rounds to 1 minute
        expect(formatAgo(now - 60000)).toBe('1m ago');
        expect(formatAgo(now - 120000)).toBe('2m ago');
        expect(formatAgo(now - 3540000)).toBe('59m ago'); // 59 minutes
    });

    it('returns hours for times 60 minutes or more ago', () => {
        const now = Date.now();
        expect(formatAgo(now - 3600000)).toBe('1h ago'); // 60 minutes
        expect(formatAgo(now - 7200000)).toBe('2h ago');
        expect(formatAgo(now - 86400000)).toBe('24h ago');
    });

    it('handles future timestamps by clamping diff to 0 (just now)', () => {
        const now = Date.now();
        expect(formatAgo(now + 60000)).toBe('just now');
    });

    it('falls back to default strings if I18N.getMessage returns undefined', () => {
        global.I18N.getMessage = jest.fn(() => undefined);
        const now = Date.now();
        expect(formatAgo(now)).toBe('just now');
        expect(formatAgo(now - 60000)).toBe('1m ago');
        expect(formatAgo(now - 3600000)).toBe('1h ago');
    });
});
