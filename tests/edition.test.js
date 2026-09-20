import { analyzeMessagesHTML } from '../js/edition.js';

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

    it('cleans up HTML tags and entities in subject and snippet', () => {
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
            subject: 'Subject with spaces and bold',
            snippet: 'Snippet with entities and italics',
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
