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
export function analyzeHTML(input, inboxPref) {
	let totalCount = -1;
	let output = input;

	if (output.length === 0) {
		return -3;
	}
	if (output.indexOf('type="password"') !== -1 || output.indexOf("type='password'") !== -1) {
		return -2;
	}

	let index = output.indexOf('<div class="b-folders">');
	if (index === -1) {
		return -1;
	}
	output = output.substr(index + 23);
	index = output.indexOf("</div>");
	if (index === -1) {
		return -1;
	}
	output = output.split("</div>", 1).toString();
	if (output.indexOf('href="/lite/inbox"') === -1) {
		return -1;
	}

	// Inbox folder count.
	let output1 = output.split('href="/lite/inbox', 1).toString();
	index = output1.indexOf('class="b-folders__folder__num"');
	if (index === -1) {
		totalCount = 0;
	} else {
		output1 = output1.substr(index + 30);
		index = output1.indexOf(">");
		if (index === -1) { return -1; }
		output1 = output1.substr(index + 1);
		index = output1.indexOf("</span>");
		if (index === -1) { return -1; }
		output1 = output1.split("</span>", 1).toString();
		if (!NUMBER_PATTERN.test(output1)) { return -1; }
		totalCount = Number(output1.replace(/,/g, ""));
	}

	// Optionally fold in unread counters of custom labels.
	if (totalCount !== -1 && inboxPref) {
		index = output.indexOf("</a>");
		while (index !== -1) {
			const anchor = output.split("</a>", 1).toString();
			output = output.substr(index + 4);
			const numIndex = anchor.indexOf('class="b-folders__folder__num"');
			if (numIndex !== -1) {
				let value = anchor.substr(numIndex + 30);
				let gt = value.indexOf(">");
				if (gt === -1) { return -1; }
				value = value.substr(gt + 1);

				const hrefIndex = anchor.indexOf('href="');
				if (hrefIndex === -1) { return -1; }
				let href = anchor.substr(hrefIndex + 6);
				const quote = href.indexOf('"');
				if (quote === -1) { return -1; }
				href = href.split('"', 1).toString();

				if (href !== "/lite/inbox" && href !== "/lite/sent" && href !== "/lite/trash" && href !== "/lite/spam") {
					const spanEnd = value.indexOf("</span>");
					if (spanEnd === -1) { return -1; }
					value = value.split("</span>", 1).toString();
					if (!NUMBER_PATTERN.test(value)) { return -1; }
					totalCount += Number(value.replace(/,/g, ""));
				}
			}
			index = output.indexOf("</a>");
		}
	}

	return totalCount;
}
