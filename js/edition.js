//================================================================
// Yandex Mail edition: site URLs and the lite-inbox HTML parser.
//================================================================

export const checkEmailURL = [
	"https://mail.yandex.com/lite/inbox",
	"https://mail.yandex.by/lite/inbox",
	"https://mail.yandex.kz/lite/inbox",
	"https://mail.yandex.ru/lite/inbox",
	"https://mail.yandex.com.tr/lite/inbox",
	"https://mail.yandex.ua/lite/inbox",
];

export const emailURL = [
	"https://mail.yandex.com",
	"https://mail.yandex.by",
	"https://mail.yandex.kz",
	"https://mail.yandex.ru",
	"https://mail.yandex.com.tr",
	"https://mail.yandex.ua",
];

export const matchPattern = [
	"*://*.mail.yandex.com/*",
	"*://*.mail.yandex.by/*",
	"*://*.mail.yandex.kz/*",
	"*://*.mail.yandex.ru/*",
	"*://*.mail.yandex.com.tr/*",
	"*://*.mail.yandex.ua/*",
];

export const siteNames = ["yandex.com", "yandex.by", "yandex.kz", "yandex.ru", "yandex.com.tr", "yandex.ua"];

const NUMBER_PATTERN = /^\d{1,3}(,\d\d\d)*$|^\d+$/;

// Returns: -3 not connected, -2 logged out, -1 unknown response, 0+ unread count.
// The scraping logic is intentionally kept close to the original to preserve
// the exact parsing behavior against Yandex lite markup. inboxPref mirrors the
// old preference.inbox flag (also fold in custom-label counters when set).
export function analyzeMessagesHTML(input) {
	const messages = [];

	let index = input.indexOf('class="b-messages"');
	if (index === -1) return messages;

	let output = input.substr(index);

	const messageBlocks = [];
	const regex = /<div[^>]*class="[^"]*(?:b-messages__message|b-message )[^"]*"[^>]*>([\s\S]*?)<\/div>(?=\s*(?:<div[^>]*class="[^"]*(?:b-messages__message|b-message )|<\/div>))/g;
	let match;
	while ((match = regex.exec(output)) !== null) {
		messageBlocks.push(match[0]);
	}

	for (const block of messageBlocks) {
		const isUnread = block.includes('b-message_unread') || block.includes('b-messages__message_unread');

		let href = '';
		const hrefMatch = block.match(/href="(\/lite\/(?:message|thread)\/[^"]+)"/);
		if (hrefMatch) href = hrefMatch[1];

		let sender = '';
		const senderTitleMatch = block.match(/class="[^"]*b-message__from[^"]*"[^>]*title="([^"]+)"/);
		if (senderTitleMatch) {
			sender = senderTitleMatch[1];
		} else {
			const senderMatch = block.match(/class="[^"]*b-message__from__text[^"]*"[^>]*>([^<]+)<\/span>/) || 
			                    block.match(/class="[^"]*b-messages__message__sender[^"]*"[^>]*>([^<]+)<\/span>/) ||
			                    block.match(/class="[^"]*b-messages__from__text[^"]*"[^>]*>(?:<span[^>]*>)?([^<]+)<\/span>/);
			if (senderMatch) sender = senderMatch[1].trim();
		}

		let subject = '';
		const subjectMatch = block.match(/class="[^"]*b-message__subject__text[^"]*"[^>]*>([\s\S]*?)<\/span>/) || 
		                     block.match(/class="[^"]*b-messages__message__subject[^"]*"[^>]*>([\s\S]*?)<\/span>/) ||
		                     block.match(/class="[^"]*b-messages__subject[^"]*"[^>]*>(?:<span[^>]*>)?([\s\S]*?)<\/span>/);
		if (subjectMatch) subject = subjectMatch[1].trim().replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '');

		let snippet = '';
		const snippetMatch = block.match(/class="[^"]*b-message__firstline[^"]*"[^>]*>([\s\S]*?)<\/span>/) || 
		                     block.match(/class="[^"]*b-messages__message__firstline[^"]*"[^>]*>([\s\S]*?)<\/span>/) ||
		                     block.match(/class="[^"]*b-messages__firstline[^"]*"[^>]*>([\s\S]*?)<\/span>/);
		if (snippetMatch) snippet = snippetMatch[1].trim().replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '');

		if (href) {
			messages.push({
				isUnread,
				href,
				sender,
				subject,
				snippet
			});
		}
	}

	return messages;
}

export function analyzeHTML(input, inboxPref) {
	if (!input || input.length === 0) {
		return -3;
	}
	if (input.includes('type="password"') || input.includes("type='password'")) {
		return -2;
	}

	const foldersStart = input.indexOf('<div class="b-folders">');
	if (foldersStart === -1) {
		return -1;
	}

	const foldersEnd = input.indexOf('</div>', foldersStart);
	if (foldersEnd === -1) {
		return -1;
	}

	const foldersHtml = input.slice(foldersStart, foldersEnd);
	if (!foldersHtml.includes('href="/lite/inbox"')) {
		return -1;
	}

	let totalCount = 0;

	// Inbox folder count
	const inboxChunk = foldersHtml.split('href="/lite/inbox"')[0];
	const inboxNumMatch = inboxChunk.match(/class="b-folders__folder__num"[^>]*>\s*([\s\S]*?)\s*<\/span>/);
	if (inboxNumMatch) {
		const numStr = inboxNumMatch[1].trim();
		if (!NUMBER_PATTERN.test(numStr)) return -1;
		totalCount = Number(numStr.replace(/,/g, ""));
	}

	// Optionally fold in unread counters of custom labels.
	if (inboxPref) {
		const chunks = foldersHtml.split("</a>");
		chunks.pop(); // Remove the trailing chunk after the last </a>

		for (const chunk of chunks) {
			const numMatch = chunk.match(/class="b-folders__folder__num"[^>]*>\s*([\s\S]*?)\s*<\/span>/);
			if (numMatch) {
				const numStr = numMatch[1].trim();
				const hrefMatch = chunk.match(/href="([^"]+)"/);

				if (hrefMatch) {
					const href = hrefMatch[1];
					if (href !== "/lite/inbox" && href !== "/lite/sent" && href !== "/lite/trash" && href !== "/lite/spam") {
						if (!NUMBER_PATTERN.test(numStr)) return -1;
						totalCount += Number(numStr.replace(/,/g, ""));
					}
				} else {
					return -1;
				}
			}
		}
	}

	return totalCount;
}
