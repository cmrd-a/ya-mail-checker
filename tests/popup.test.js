import { jest } from '@jest/globals';
import { chrome } from 'jest-chrome';

global.I18N = {
    ready: Promise.resolve(),
    getMessage: jest.fn((key, subs) => {
        if (key === 'statusEmpty') return 'No unread messages';
        if (key === 'lastChecked') return 'Checked ' + (subs ? subs[0] : '');
        if (key === 'deleteMail') return 'Delete';
        if (key === 'justNow') return 'just now';
        if (key === 'minutesAgo') return `${subs[0]}m ago`;
        if (key === 'hoursAgo') return `${subs[0]}h ago`;
        return key;
    })
};

global.chrome = chrome;
global.setInterval = jest.fn(); // Prevent open handle for setInterval

describe('popup.js', () => {
    let popupModule;
    let windowCloseSpy;
    let originalClose;

    beforeAll(async () => {
        originalClose = window.close;
        popupModule = await import('../js/popup.js');
    });

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="openMailTitle"></div>
            <div id="checkNow"></div>
            <div id="options"></div>
            <div id="openMail"></div>
            <span id="headerCount"></span>
            <div id="lastChecked"></div>
            <div id="messageList"></div>
        `;

        windowCloseSpy = jest.fn();
        window.close = windowCloseSpy;

        chrome.runtime.sendMessage.mockClear();
        chrome.runtime.openOptionsPage.mockClear();
        global.I18N.getMessage.mockClear();
        global.setInterval.mockClear();
    });

    afterAll(() => {
        window.close = originalClose;
    });

    // Helper to flush promises
    const flushPromises = () => new Promise(process.nextTick);

    describe('formatAgo', () => {
        it('returns empty string if no timestamp', () => {
            expect(popupModule._testFormatAgo(null)).toBe('');
        });
        it('returns just now if diffSec < 45', () => {
            expect(popupModule._testFormatAgo(Date.now() - 10000)).toBe('just now');
        });
        it('returns minutesAgo if diffSec < 3600', () => {
            expect(popupModule._testFormatAgo(Date.now() - 120000)).toBe('2m ago');
        });
        it('returns hoursAgo if diffSec >= 3600', () => {
            expect(popupModule._testFormatAgo(Date.now() - 7200000)).toBe('2h ago');
        });
    });

    describe('hashCode', () => {
        it('returns deterministic hash for strings', () => {
            const h1 = popupModule._testHashCode("Alice");
            const h2 = popupModule._testHashCode("Bob");
            const h3 = popupModule._testHashCode("Alice");
            expect(h1).not.toBe(h2);
            expect(h1).toBe(h3);
        });
    });

    describe('buildAvatar', () => {
        it('creates a colored avatar div with initials', () => {
            const avatar = popupModule._testBuildAvatar("Alice");
            expect(avatar.className).toBe("email-avatar");
            expect(avatar.textContent).toBe("A");
            expect(avatar.style.background).not.toBe("");
        });
        it('handles empty names', () => {
            const avatar = popupModule._testBuildAvatar("");
            expect(avatar.className).toBe("email-avatar");
            expect(avatar.textContent).toBe("?");
            expect(avatar.style.background).not.toBe("");
        });
    });

    describe('buildIcon', () => {
        it('creates an SVG with given paths', () => {
            const svg = popupModule._testBuildIcon(["M1 1", "M2 2"]);
            expect(svg.tagName.toLowerCase()).toBe("svg");
            expect(svg.children.length).toBe(2);
            expect(svg.children[0].tagName.toLowerCase()).toBe("path");
        });
    });

    describe('DOM events and message parsing', () => {
        it('binds standard clicks to close popup and send messages', async () => {
            document.dispatchEvent(new Event('DOMContentLoaded'));
            await flushPromises();

            document.getElementById("openMail").click();
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "openMail" });
            expect(windowCloseSpy).toHaveBeenCalled();

            document.getElementById("openMailTitle").click();
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "openMail" });

            document.getElementById("checkNow").click();
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "checkNow" });

            document.getElementById("options").click();
            expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
        });

        it('renders empty state when no messages', async () => {
            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                if (msg.type === "getMessages" && callback) {
                    callback({ messages: [], lastCheckedAt: Date.now() - 1000, unreadCount: 0 });
                }
            });

            document.dispatchEvent(new Event('DOMContentLoaded'));
            await flushPromises();

            const list = document.getElementById("messageList");
            expect(list.innerHTML).toContain('no-messages');
            expect(document.getElementById("headerCount").textContent).toBe("");
        });

        it('renders messages and handles delete', async () => {
            const messages = [
                {
                    sender: "Alice",
                    subject: "Hello",
                    snippet: "World",
                    isUnread: true,
                    href: "/mail/1",
                    actionField: "msg1",
                    actionValue: "val1"
                },
                {
                    sender: "Bob",
                    subject: "Re: Hello",
                    snippet: "Yes",
                    isUnread: false,
                    href: "/mail/2",
                    actionField: "msg2",
                    actionValue: "val2"
                }
            ];

            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                if (msg.type === "getMessages" && callback) {
                    callback({ messages, lastCheckedAt: Date.now() - 1000, unreadCount: 1 });
                } else if (msg.type === "deleteMessage" && callback) {
                    callback({ ok: true });
                }
            });

            document.dispatchEvent(new Event('DOMContentLoaded'));
            await flushPromises();

            const list = document.getElementById("messageList");
            const items = list.querySelectorAll(".email-item");

            expect(items.length).toBe(2);
            expect(items[0].classList.contains("unread")).toBe(true);
            expect(items[1].classList.contains("unread")).toBe(false);

            expect(document.getElementById("headerCount").textContent).toBe("1");

            const deleteBtn = items[0].querySelector(".email-delete-btn");
            deleteBtn.click();

            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
                { type: "deleteMessage", actionField: "msg1", actionValue: "val1" },
                expect.any(Function)
            );

            expect(list.querySelectorAll(".email-item").length).toBe(1);
            expect(document.getElementById("headerCount").textContent).toBe("");
        });

        it('handles failed delete message', async () => {
             jest.useFakeTimers();
             const messages = [
                {
                    sender: "Alice",
                    subject: "Hello",
                    snippet: "World",
                    isUnread: true,
                    href: "/mail/1",
                    actionField: "msg1",
                    actionValue: "val1"
                }
            ];

            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                if (msg.type === "getMessages" && callback) {
                    callback({ messages, lastCheckedAt: Date.now() - 1000, unreadCount: 1 });
                } else if (msg.type === "deleteMessage" && callback) {
                    callback({ ok: false }); // Failure
                }
            });

            document.dispatchEvent(new Event('DOMContentLoaded'));
            // With fake timers, we might need to await process.nextTick specifically
            // But we can just use runAllTicks or resolve
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();

            const list = document.getElementById("messageList");
            const items = list.querySelectorAll(".email-item");

            const deleteBtn = items[0].querySelector(".email-delete-btn");
            deleteBtn.click();

            expect(deleteBtn.classList.contains("error")).toBe(true);

            jest.advanceTimersByTime(1500);
            expect(deleteBtn.classList.contains("error")).toBe(false);

            jest.useRealTimers();
        });

        it('opens mail when clicking message item', async () => {
             const messages = [
                {
                    sender: "Alice",
                    subject: "Hello",
                    snippet: "World",
                    isUnread: true,
                    href: "/mail/1",
                    actionField: "msg1",
                    actionValue: "val1"
                }
            ];

            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                if (msg.type === "getMessages" && callback) {
                    callback({ messages, lastCheckedAt: Date.now() - 1000, unreadCount: 1 });
                }
            });

            document.dispatchEvent(new Event('DOMContentLoaded'));
            await flushPromises();

            const list = document.getElementById("messageList");
            const items = list.querySelectorAll(".email-item");

            items[0].click();

            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "openMail", url: "/mail/1" });
            expect(windowCloseSpy).toHaveBeenCalled();
        });

        it('prevent contextmenu', () => {
            const preventDefault = jest.fn();
            const stopPropagation = jest.fn();
            const event = new MouseEvent('contextmenu');
            event.preventDefault = preventDefault;
            event.stopPropagation = stopPropagation;

            window.dispatchEvent(event);
            expect(preventDefault).toHaveBeenCalled();
            expect(stopPropagation).toHaveBeenCalled();
        });
    });
});
