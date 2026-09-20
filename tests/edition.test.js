import { analyzeHTML } from '../js/edition.js';

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

        // Missing span closing tag for number
        const noClosingSpan = '<div class="b-folders"><a class="b-folders__folder__num">5<span href="/lite/inbox">Inbox</span></a></div>';
        expect(analyzeHTML(noClosingSpan, false)).toBe(-1);

        // Missing value (no closing > for span/class)
        const noClosingBracket = '<div class="b-folders"><a class="b-folders__folder__num" 5</span><span href="/lite/inbox">Inbox</span></a></div>';
        expect(analyzeHTML(noClosingBracket, false)).toBe(-1);
    });

    test('calculates custom labels when inboxPref is true', () => {
        const customHTML = '<div class="b-folders"><a class="b-folders__folder__num">5</span><span href="/lite/inbox">Inbox</span></a><a class="b-folders__folder__num">3</span><span href="/lite/custom">Custom</span></a></div>';

        // When false, ignores custom
        expect(analyzeHTML(customHTML, false)).toBe(5);

        // When true, adds custom
        expect(analyzeHTML(customHTML, true)).toBe(8);

        // Multiple custom labels
        const multiCustomHTML = '<div class="b-folders"><a class="b-folders__folder__num">5</span><span href="/lite/inbox">Inbox</span></a><a class="b-folders__folder__num">3</span><span href="/lite/custom1">Custom1</span></a><a class="b-folders__folder__num">1,000</span><span href="/lite/custom2">Custom2</span></a></div>';
        expect(analyzeHTML(multiCustomHTML, true)).toBe(1008);
    });

    test('ignores system folders when inboxPref is true', () => {
        const sysHTML = '<div class="b-folders"><a class="b-folders__folder__num">5</span><span href="/lite/inbox">Inbox</span></a>' +
                        '<a class="b-folders__folder__num">3</span><span href="/lite/sent">Sent</span></a>' +
                        '<a class="b-folders__folder__num">2</span><span href="/lite/trash">Trash</span></a>' +
                        '<a class="b-folders__folder__num">1</span><span href="/lite/spam">Spam</span></a>' +
                        '<a class="b-folders__folder__num">10</span><span href="/lite/custom">Custom</span></a></div>';
        expect(analyzeHTML(sysHTML, true)).toBe(15); // 5 (inbox) + 10 (custom), ignoring others
    });

    test('returns -1 if custom label count is malformed and inboxPref is true', () => {
        const baseHTML = '<div class="b-folders"><a class="b-folders__folder__num">5</span><span href="/lite/inbox">Inbox</span></a><a class="b-folders__folder__num">NUM</span><span href="/lite/custom">Custom</span></a></div>';

        expect(analyzeHTML(baseHTML.replace('NUM', '3a'), true)).toBe(-1);
        expect(analyzeHTML(baseHTML.replace('NUM', ''), true)).toBe(-1);

        const noSpanEnd = '<div class="b-folders"><a class="b-folders__folder__num">5</span><span href="/lite/inbox">Inbox</span></a><a class="b-folders__folder__num">3<span href="/lite/custom">Custom</span></a></div>';
        expect(analyzeHTML(noSpanEnd, true)).toBe(-1);
    });
});
