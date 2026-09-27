import { jest } from '@jest/globals';

let mockQueryMatches = false;
let mockAddEventListener = jest.fn();

global.matchMedia = jest.fn().mockImplementation((query) => ({
    matches: mockQueryMatches,
    addEventListener: mockAddEventListener,
}));

global.chrome = {
    runtime: {
        sendMessage: jest.fn().mockReturnValue(Promise.resolve()),
        onMessage: {
            addListener: jest.fn(),
        }
    }
};

describe('offscreen.js', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        mockQueryMatches = false;
        mockAddEventListener = jest.fn();
        global.chrome.runtime.sendMessage.mockReturnValue(Promise.resolve());
        global.window = global;
    });

    describe('reportTheme', () => {
        it('sends theme change message on load', async () => {
            mockQueryMatches = true;
            await import('../js/offscreen.js');

            expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: "themeChanged",
                dark: true
            });
        });

        it('adds event listener for theme change', async () => {
            await import('../js/offscreen.js');
            expect(mockAddEventListener).toHaveBeenCalledWith('change', expect.any(Function));
        });

        it('handles sendMessage rejection', async () => {
            global.chrome.runtime.sendMessage.mockReturnValue(Promise.reject(new Error('Extension context invalidated.')));
            // Just verifying it doesn't throw
            await import('../js/offscreen.js');
            expect(global.chrome.runtime.sendMessage).toHaveBeenCalled();
        });
    });

    describe('playTone', () => {
        let mockAudioContext, mockOscillator, mockGain, mockClose;

        beforeEach(() => {
            mockOscillator = {
                type: '',
                frequency: { value: 0 },
                connect: jest.fn().mockReturnThis(),
                start: jest.fn(),
                stop: jest.fn(),
            };
            mockGain = {
                gain: {
                    setValueAtTime: jest.fn(),
                    linearRampToValueAtTime: jest.fn(),
                    exponentialRampToValueAtTime: jest.fn(),
                },
                connect: jest.fn().mockReturnThis(),
            };
            mockClose = jest.fn();

            mockAudioContext = jest.fn(() => ({
                currentTime: 0,
                createOscillator: jest.fn(() => mockOscillator),
                createGain: jest.fn(() => mockGain),
                destination: {},
                close: mockClose,
            }));
            global.AudioContext = mockAudioContext;
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
            delete global.AudioContext;
        });

        it('catches errors when AudioContext throws', async () => {
            global.AudioContext = jest.fn(() => {
                throw new Error('AudioContext not supported');
            });

            await import('../js/offscreen.js');
            const listener = global.chrome.runtime.onMessage.addListener.mock.calls[0][0];

            expect(() => {
                listener({ type: "playSound", sound: "chime" });
            }).not.toThrow();
        });

        it('plays chime sound correctly', async () => {
            await import('../js/offscreen.js');
            const listener = global.chrome.runtime.onMessage.addListener.mock.calls[0][0];

            listener({ type: "playSound", sound: "chime" });

            expect(global.AudioContext).toHaveBeenCalled();
            // chime has 3 notes
            expect(mockOscillator.start).toHaveBeenCalledTimes(3);
            expect(mockOscillator.stop).toHaveBeenCalledTimes(3);

            jest.advanceTimersByTime(1200);
            expect(mockClose).toHaveBeenCalled();
        });

        it('plays bell sound correctly', async () => {
            await import('../js/offscreen.js');
            const listener = global.chrome.runtime.onMessage.addListener.mock.calls[0][0];

            listener({ type: "playSound", sound: "bell" });

            expect(global.AudioContext).toHaveBeenCalled();
            // bell has 2 notes
            expect(mockOscillator.start).toHaveBeenCalledTimes(2);
            expect(mockOscillator.stop).toHaveBeenCalledTimes(2);

            jest.advanceTimersByTime(1200);
            expect(mockClose).toHaveBeenCalled();
        });

        it('does nothing for unknown sound', async () => {
            await import('../js/offscreen.js');
            const listener = global.chrome.runtime.onMessage.addListener.mock.calls[0][0];

            listener({ type: "playSound", sound: "unknown" });

            expect(global.AudioContext).not.toHaveBeenCalled();
        });

        it('ignores other message types', async () => {
            await import('../js/offscreen.js');
            const listener = global.chrome.runtime.onMessage.addListener.mock.calls[0][0];

            listener({ type: "otherType" });
            listener(undefined);
            listener(null);

            expect(global.AudioContext).not.toHaveBeenCalled();
        });
    });
});
