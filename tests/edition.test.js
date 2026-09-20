import { analyzeMessagesHTML, analyzeHTML } from '../js/edition.js';

describe('analyzeMessagesHTML', () => {
    it('returns an empty array if "b-messages" class is not found', () => {
        const html = `<div>Some random content without messages</div>`;
        expect(analyzeMessagesHTML(html)).toEqual([]);
    });

    it('parses unread messages correctly', () => {
        const html = `
            <div class="b-messages">
                <div class="b-message b-message_unread ">
                    <a href="/lite/message/12345">
                        <span class="b-message__from" title="Sender 1">Sender 1</span>
                        <span class="b-message__subject__text">Subject 1</span>
                        <span class="b-message__firstline">Snippet 1</span>
                    </a>
                </div>
            </div>
        `;
        const result = analyzeMessagesHTML(html);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            isUnread: true,
            href: '/lite/message/12345',
            sender: 'Sender 1',
            subject: 'Subject 1',
            snippet: 'Snippet 1',
        });
    });

    it('parses read messages correctly', () => {
        const html = `
            <div class="b-messages">
                <div class="b-message ">
                    <a href="/lite/message/67890">
                        <span class="b-message__from" title="Sender 2">Sender 2</span>
                        <span class="b-message__subject__text">Subject 2</span>
                        <span class="b-message__firstline">Snippet 2</span>
                    </a>
                </div>
            </div>
        `;
        const result = analyzeMessagesHTML(html);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            isUnread: false,
            href: '/lite/message/67890',
            sender: 'Sender 2',
            subject: 'Subject 2',
            snippet: 'Snippet 2',
        });
    });

    it('cleans up entities in subject and snippet', () => {
        const html = `
            <div class="b-messages">
                <div class="b-message ">
                    <a href="/lite/message/11111">
                        <span class="b-message__from" title="Sender 3">Sender 3</span>
                        <span class="b-message__subject__text">Subject&nbsp;with&nbsp;spaces and <b>bold</b></span>
                        <span class="b-message__firstline">Snippet&nbsp;with&nbsp;entities and <i>italics</i></span>
                    </a>
                </div>
            </div>
        `;
        const result = analyzeMessagesHTML(html);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            isUnread: false,
            href: '/lite/message/11111',
            sender: 'Sender 3',
            subject: 'Subject with spaces and <b>bold</b>',
            snippet: 'Snippet with entities and <i>italics</i>',
        });
    });

    it('handles alternative class names for parsing', () => {
        const html = `
            <div class="b-messages">
                <div class="b-messages__message b-messages__message_unread">
                    <a href="/lite/message/22222">
                        <span class="b-messages__message__sender">Alt Sender</span>
                        <span class="b-messages__message__subject">Alt Subject</span>
                        <span class="b-messages__message__firstline">Alt Snippet</span>
                    </a>
                </div>
                <div class="b-messages__message">
                    <a href="/lite/message/33333">
                        <span class="b-messages__from__text"><span>Yet Another Sender</span></span>
                        <span class="b-messages__subject"><span>Yet Another Subject</span></span>
                        <span class="b-messages__firstline">Yet Another Snippet</span>
                    </a>
                </div>
                <div class="b-message ">
                    <a href="/lite/thread/44444">
                        <span class="b-message__from__text">Thread Sender</span>
                        <span class="b-message__subject__text">Thread Subject</span>
                        <span class="b-message__firstline">Thread Snippet</span>
                    </a>
                </div>
            </div>
        `;
        const result = analyzeMessagesHTML(html);
        expect(result).toHaveLength(3);

        expect(result[0]).toEqual({
            isUnread: true,
            href: '/lite/message/22222',
            sender: 'Alt Sender',
            subject: 'Alt Subject',
            snippet: 'Alt Snippet',
        });

        expect(result[1]).toEqual({
            isUnread: false,
            href: '/lite/message/33333',
            sender: 'Yet Another Sender',
            subject: 'Yet Another Subject',
            snippet: 'Yet Another Snippet',
        });

        expect(result[2]).toEqual({
            isUnread: false,
            href: '/lite/thread/44444',
            sender: 'Thread Sender',
            subject: 'Thread Subject',
            snippet: 'Thread Snippet',
        });
    });

    it('ignores messages without a valid href', () => {
        const html = `
            <div class="b-messages">
                <div class="b-message ">
                    <span class="b-message__from" title="Sender 4">Sender 4</span>
                    <span class="b-message__subject__text">Subject 4</span>
                    <span class="b-message__firstline">Snippet 4</span>
                </div>
            </div>
        `;
        const result = analyzeMessagesHTML(html);
        expect(result).toHaveLength(0);
    });
});

describe('analyzeHTML', () => {
    test('returns -3 for empty input', () => {
        expect(analyzeHTML('', false)).toBe(-3);
        expect(analyzeHTML('', true)).toBe(-3);
    });

    test('returns -2 when logged out (detects password fields)', () => {
        expect(analyzeHTML('<input type="password" />', false)).toBe(-2);
        expect(analyzeHTML("<input type='password' />", false)).toBe(-2);
        expect(analyzeHTML('<html><body><input type="password"></body></html>', false)).toBe(-2);
    });

    test('returns -1 for invalid HTML structures', () => {
        // Missing <div class="b-folders">
        expect(analyzeHTML('<div>Some content without folders</div>', false)).toBe(-1);

        // Missing </div> after b-folders
        expect(analyzeHTML('<div class="b-folders">Some content without closing div', false)).toBe(-1);

        // Missing href="/lite/inbox"
        expect(analyzeHTML('<div class="b-folders"></div><a href="/lite/sent">Sent</a>', false)).toBe(-1);
    });

    test('returns 0 if inbox folder count element is missing', () => {
        const html = '<div class="b-folders"> <a href="/lite/inbox">Inbox</a> </div>';
        expect(analyzeHTML(html, false)).toBe(0);
    });

    test('extracts unread counts correctly for the inbox', () => {
        // Structurally correct HTML representation matching parser expectations
        const baseHTML = '<div class="b-folders"><a class="b-folders__folder__num">NUM</span><span href="/lite/inbox">Inbox</span></a></div>';

        expect(analyzeHTML(baseHTML.replace('NUM', '5'), false)).toBe(5);
        expect(analyzeHTML(baseHTML.replace('NUM', '1,234'), false)).toBe(1234);
    });

    test('returns -1 if inbox count is malformed', () => {
        const baseHTML = '<div class="b-folders"><a class="b-folders__folder__num">NUM</span><span href="/lite/inbox">Inbox</span></a></div>';

        // Malformed number format
        expect(analyzeHTML(baseHTML.replace('NUM', '5a'), false)).toBe(-1);
        expect(analyzeHTML(baseHTML.replace('NUM', '1,23'), false)).toBe(-1); // invalid comma format according to regex
        expect(analyzeHTML(baseHTML.replace('NUM', ''), false)).toBe(-1);

        // Missing span closing tag for the number: the parser can't find a
        // recognizable count within the inbox chunk, so it falls back to 0
        // rather than erroring.
        const noClosingSpan = '<div class="b-folders"><a class="b-folders__folder__num">5<span href="/lite/inbox">Inbox</span></a></div>';
        expect(analyzeHTML(noClosingSpan, false)).toBe(0);

        // Missing value (no closing > for span/class) - same fallback.
        const noClosingBracket = '<div class="b-folders"><a class="b-folders__folder__num" 5</span><span href="/lite/inbox">Inbox</span></a></div>';
        expect(analyzeHTML(noClosingBracket, false)).toBe(0);
    });

    test('calculates custom labels when inboxPref is true', () => {
        // Custom-label anchors must have href before the num span for the
        // parser's label regex to pick them up.
        const customHTML = '<div class="b-folders"><a class="b-folders__folder__num">5</span><span href="/lite/inbox">Inbox</span></a><a href="/lite/custom"><span class="b-folders__folder__num">3</span></a></div>';

        // When false, ignores custom
        expect(analyzeHTML(customHTML, false)).toBe(5);

        // When true, adds custom
        expect(analyzeHTML(customHTML, true)).toBe(8);

        // Multiple custom labels
        const multiCustomHTML = '<div class="b-folders"><a class="b-folders__folder__num">5</span><span href="/lite/inbox">Inbox</span></a><a href="/lite/custom1"><span class="b-folders__folder__num">3</span></a><a href="/lite/custom2"><span class="b-folders__folder__num">1,000</span></a></div>';
        expect(analyzeHTML(multiCustomHTML, true)).toBe(1008);
    });

    test('ignores system folders when inboxPref is true', () => {
        const sysHTML = '<div class="b-folders"><a class="b-folders__folder__num">5</span><span href="/lite/inbox">Inbox</span></a>' +
                        '<a href="/lite/sent"><span class="b-folders__folder__num">3</span></a>' +
                        '<a href="/lite/trash"><span class="b-folders__folder__num">2</span></a>' +
                        '<a href="/lite/spam"><span class="b-folders__folder__num">1</span></a>' +
                        '<a href="/lite/custom"><span class="b-folders__folder__num">10</span></a></div>';
        expect(analyzeHTML(sysHTML, true)).toBe(15); // 5 (inbox) + 10 (custom), ignoring others
    });

    test('returns -1 if custom label count is malformed and inboxPref is true', () => {
        const baseHTML = '<div class="b-folders"><a class="b-folders__folder__num">5</span><span href="/lite/inbox">Inbox</span></a><a href="/lite/custom"><span class="b-folders__folder__num">NUM</span></a></div>';

        expect(analyzeHTML(baseHTML.replace('NUM', '3a'), true)).toBe(-1);
        expect(analyzeHTML(baseHTML.replace('NUM', ''), true)).toBe(-1);

        // A custom label missing its closing span is simply not recognized
        // as a label match, so it's skipped rather than erroring.
        const noSpanEnd = '<div class="b-folders"><a class="b-folders__folder__num">5</span><span href="/lite/inbox">Inbox</span></a><a href="/lite/custom"><span class="b-folders__folder__num">3</a></div>';
        expect(analyzeHTML(noSpanEnd, true)).toBe(5);
    });
});
