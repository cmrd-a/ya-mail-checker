import { analyzeHTML, analyzeMessagesHTML, checkEmailURL, emailURL, matchPattern, siteNames } from '../edition.js';

describe('Yandex Mail Edition Module', () => {
  describe('Constants', () => {
    test('checkEmailURL should contain correct URLs', () => {
      expect(checkEmailURL).toHaveLength(6);
      expect(checkEmailURL[0]).toBe("https://mail.yandex.com/lite/inbox");
    });

    test('emailURL should contain correct URLs', () => {
      expect(emailURL).toHaveLength(6);
      expect(emailURL[0]).toBe("https://mail.yandex.com");
    });

    test('matchPattern should contain correct patterns', () => {
      expect(matchPattern).toHaveLength(6);
      expect(matchPattern[0]).toBe("*://*.mail.yandex.com/*");
    });

    test('siteNames should contain correct domain names', () => {
      expect(siteNames).toHaveLength(6);
      expect(siteNames[0]).toBe("yandex.com");
    });
  });

  describe('analyzeMessagesHTML', () => {
    test('should return empty array if no messages block found', () => {
      const html = '<div>No messages here</div>';
      const result = analyzeMessagesHTML(html);
      expect(result).toEqual([]);
    });

    test('should parse a single unread message with title sender', () => {
      const html = `
        <div class="b-messages">
          <div class="b-messages__message b-messages__message_unread">
            <a href="/lite/message/12345">
              <span class="b-message__from" title="Sender Name"></span>
              <span class="b-message__subject__text">Test Subject</span>
              <span class="b-message__firstline">Test Snippet</span>
            </a>
          </div>
        </div>
      `;
      const result = analyzeMessagesHTML(html);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        isUnread: true,
        href: '/lite/message/12345',
        sender: 'Sender Name',
        subject: 'Test Subject',
        snippet: 'Test Snippet'
      });
    });

    test('should parse a read message with span text sender and html entities', () => {
      const html = `
        <div class="b-messages">
          <div class="b-messages__message">
            <a href="/lite/thread/67890">
              <span class="b-message__from__text">John Doe</span>
              <span class="b-messages__message__subject">Re:&nbsp;Hello</span>
              <span class="b-messages__message__firstline">How are you? &lt;br&gt;</span>
            </a>
          </div>
        </div>
      `;
      const result = analyzeMessagesHTML(html);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        isUnread: false,
        href: '/lite/thread/67890',
        sender: 'John Doe',
        subject: 'Re: Hello',
        snippet: 'How are you? &lt;br&gt;'
      });
    });

    test('should parse a message with alternative classes', () => {
      const html = `
        <div class="b-messages">
          <div class="b-message ">
            <a href="/lite/message/abcde">
              <span class="b-messages__message__sender">Jane Doe</span>
              <span class="b-messages__subject"><span>Subject 2</span></span>
              <span class="b-messages__firstline">Snippet 2</span>
            </a>
          </div>
        </div>
      `;
      const result = analyzeMessagesHTML(html);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        isUnread: false,
        href: '/lite/message/abcde',
        sender: 'Jane Doe',
        subject: 'Subject 2',
        snippet: 'Snippet 2'
      });
    });

    test('should handle missing fields gracefully', () => {
      const html = `
        <div class="b-messages">
          <div class="b-messages__message">
            <a href="/lite/message/only_href"></a>
          </div>
        </div>
      `;
      const result = analyzeMessagesHTML(html);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        isUnread: false,
        href: '/lite/message/only_href',
        sender: '',
        subject: '',
        snippet: ''
      });
    });

    test('should ignore blocks without href', () => {
      const html = `
        <div class="b-messages">
          <div class="b-messages__message">
            <span class="b-message__from__text">Ghost</span>
          </div>
        </div>
      `;
      const result = analyzeMessagesHTML(html);
      expect(result).toHaveLength(0);
    });
  });

  describe('analyzeHTML', () => {
    test('should return -3 for empty input', () => {
      expect(analyzeHTML('', true)).toBe(-3);
    });

    test('should return -2 for logged out state (password field present)', () => {
      expect(analyzeHTML('<input type="password">', true)).toBe(-2);
      expect(analyzeHTML("<input type='password'>", true)).toBe(-2);
    });

    test('should return -1 for unknown response (no b-folders)', () => {
      expect(analyzeHTML('<html><body>Some random html</body></html>', true)).toBe(-1);
    });

    test('should return -1 if missing inbox href', () => {
      const html = '<div class="b-folders"></div></div>';
      expect(analyzeHTML(html, true)).toBe(-1);
    });

    test('should return 0 when inbox has no unread count', () => {
      const html = `
        <div class="b-folders">
          <a href="/lite/inbox">Inbox</a>
        </div>
      `;
      expect(analyzeHTML(html, true)).toBe(0);
    });

    test('should return unread count for inbox', () => {
      const html = `
        <div class="b-folders">
          <span class="b-folders__folder__num">5</span>
          <a href="/lite/inbox">Inbox</a>
        </div>
      `;
      expect(analyzeHTML(html, false)).toBe(5);
    });

    test('should parse large unread count with commas', () => {
      const html = `
        <div class="b-folders">
          <span class="b-folders__folder__num">1,234</span>
          <a href="/lite/inbox">Inbox</a>
        </div>
      `;
      expect(analyzeHTML(html, false)).toBe(1234);
    });

    test('should ignore custom folders when inboxPref is false', () => {
      const html = `
        <div class="b-folders">
          <span class="b-folders__folder__num">2</span>
          <a href="/lite/inbox">Inbox</a>
          </a>
          <span class="b-folders__folder__num">3</span>
          <a href="/lite/folder/1">Custom</a>
        </div>
      `;
      expect(analyzeHTML(html, false)).toBe(2);
    });

    test('should add custom folders unread count when inboxPref is true', () => {
      const html = `
        <div class="b-folders">
          <span class="b-folders__folder__num">2</span>
          <a href="/lite/inbox">Inbox</a>
          </a>
          <span class="b-folders__folder__num">3</span>
          <a href="/lite/folder/1">Custom</a>
          </a>
          <span class="b-folders__folder__num">10</span>
          <a href="/lite/folder/2">Another</a>
        </div>
      `;
      // Inbox parses as 2.
      // Next matches '</a>', reads num '3', href '/lite/folder/1', adds 3. Total 5.
      // Next matches '</a>', reads num '10', href '/lite/folder/2', adds 10. Total 15.
      expect(analyzeHTML(html, true)).toBe(15);
    });

    test('should skip system folders when inboxPref is true', () => {
      const html = `
        <div class="b-folders">
          <span class="b-folders__folder__num">2</span>
          <a href="/lite/inbox">Inbox</a>
          </a>
          <span class="b-folders__folder__num">3</span>
          <a href="/lite/sent">Sent</a>
          </a>
          <span class="b-folders__folder__num">4</span>
          <a href="/lite/trash">Trash</a>
          </a>
          <span class="b-folders__folder__num">5</span>
          <a href="/lite/spam">Spam</a>
          </a>
          <span class="b-folders__folder__num">6</span>
          <a href="/lite/folder/custom">Custom</a>
        </div>
      `;
      expect(analyzeHTML(html, true)).toBe(8); // 2 (inbox) + 6 (custom)
    });

    test('should handle malformed folder count gracefully returning -1', () => {
      const html = `
        <div class="b-folders">
          <span class="b-folders__folder__num">not_a_number</span>
          <a href="/lite/inbox">Inbox</a>
        </div>
      `;
      expect(analyzeHTML(html, true)).toBe(-1);
    });
  });
});
