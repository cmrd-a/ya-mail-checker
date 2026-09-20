//================================================================
// Popup - Manifest V3 (message passing)
//================================================================
"use strict";

const AVATAR_COLORS = ["#ec3a2f", "#2f7dec", "#2fbf71", "#b23fec", "#d98c00", "#0fb5c9", "#ec3f8e", "#6b7f99"];
const LAST_CHECKED_REFRESH_MS = 30000;

const SVG_NS = "http://www.w3.org/2000/svg";
const TRASH_PATHS = [
	"M3 6h18",
	"M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6",
	"M10 11v6",
	"M14 11v6",
	"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
];

// Build a small stroke-style icon matching the header buttons.
function buildIcon(paths) {
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "2");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	for (const d of paths) {
		const path = document.createElementNS(SVG_NS, "path");
		path.setAttribute("d", d);
		svg.appendChild(path);
	}
	return svg;
}

// Small deterministic hash so the same sender always gets the same color.
function hashCode(str) {
	let h = 0;
	for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
	return Math.abs(h);
}

// A colored circle with the sender's first initial, standing in for an avatar.
function buildAvatar(name) {
	const avatar = document.createElement("div");
	avatar.className = "email-avatar";
	avatar.style.background = AVATAR_COLORS[hashCode(name || "?") % AVATAR_COLORS.length];
	avatar.textContent = (name || "?").trim().charAt(0).toUpperCase() || "?";
	return avatar;
}

// Render a relative "checked Xm ago" style label.
function formatAgo(timestamp) {
	if (!timestamp) { return ""; }
	const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
	if (diffSec < 45) { return I18N.getMessage("justNow") || "just now"; }
	const minutes = Math.round(diffSec / 60);
	if (minutes < 60) { return I18N.getMessage("minutesAgo", [String(minutes)]) || `${minutes}m ago`; }
	const hours = Math.round(minutes / 60);
	return I18N.getMessage("hoursAgo", [String(hours)]) || `${hours}h ago`;
}

document.addEventListener("DOMContentLoaded", async () => {
	await I18N.ready;
	const close = () => window.close();

	document.getElementById("openMail").addEventListener("click", () => {
		chrome.runtime.sendMessage({ type: "openMail" });
		close();
	});
	document.getElementById("openMailTitle").addEventListener("click", () => {
		chrome.runtime.sendMessage({ type: "openMail" });
		close();
	});
	document.getElementById("checkNow").addEventListener("click", () => {
		chrome.runtime.sendMessage({ type: "checkNow" });
		close();
	});
	document.getElementById("options").addEventListener("click", () => {
		chrome.runtime.openOptionsPage();
		close();
	});

	// Fetch and display messages
	chrome.runtime.sendMessage({ type: "getMessages" }, (response) => {
		const { messages, lastCheckedAt, unreadCount } = response || {};

		const headerCount = document.getElementById("headerCount");
		headerCount.textContent = unreadCount > 0 ? String(unreadCount) : "";

		const lastChecked = document.getElementById("lastChecked");
		const renderLastChecked = () => {
			const ago = formatAgo(lastCheckedAt);
			lastChecked.textContent = ago ? (I18N.getMessage("lastChecked", [ago]) || `Checked ${ago}`) : "";
		};
		renderLastChecked();
		setInterval(renderLastChecked, LAST_CHECKED_REFRESH_MS);

		const list = document.getElementById("messageList");
		list.innerHTML = "";

		const renderEmptyState = () => {
			const div = document.createElement("div");
			div.className = "no-messages";
			div.textContent = I18N.getMessage("statusEmpty") || "No unread messages";
			list.appendChild(div);
		};

		if (!messages || messages.length === 0) {
			renderEmptyState();
			return;
		}

		// Decrement the header count pill after a successful delete of an
		// unread message; clear it once it would hit zero.
		const decrementHeaderCount = () => {
			const current = Number(headerCount.textContent) || 0;
			headerCount.textContent = current > 1 ? String(current - 1) : "";
		};

		messages.forEach(msg => {
			const item = document.createElement("div");
			item.className = "email-item" + (msg.isUnread ? " unread" : "");

			const header = document.createElement("div");
			header.className = "email-header";
			header.appendChild(buildAvatar(msg.sender));

			const texts = document.createElement("div");
			texts.className = "email-texts";

			const sender = document.createElement("div");
			sender.className = "email-sender";
			sender.textContent = msg.sender || "";
			texts.appendChild(sender);

			const subject = document.createElement("div");
			subject.className = "email-subject";
			subject.textContent = msg.subject || "(No subject)";
			texts.appendChild(subject);

			const snippet = document.createElement("div");
			snippet.className = "email-snippet";
			snippet.textContent = msg.snippet || "";
			texts.appendChild(snippet);

			header.appendChild(texts);

			if (msg.actionField && msg.actionValue) {
				const deleteBtn = document.createElement("div");
				deleteBtn.className = "email-delete-btn";
				deleteBtn.title = I18N.getMessage("deleteMail") || "Delete";
				deleteBtn.setAttribute("aria-label", I18N.getMessage("deleteMail") || "Delete");
				deleteBtn.appendChild(buildIcon(TRASH_PATHS));

				deleteBtn.addEventListener("click", (event) => {
					event.stopPropagation();
					deleteBtn.classList.add("busy");
					chrome.runtime.sendMessage(
						{ type: "deleteMessage", actionField: msg.actionField, actionValue: msg.actionValue },
						(response) => {
							if (response && response.ok) {
								item.remove();
								if (msg.isUnread) { decrementHeaderCount(); }
								if (!list.children.length) { renderEmptyState(); }
							} else {
								deleteBtn.classList.remove("busy");
								deleteBtn.classList.add("error");
								setTimeout(() => deleteBtn.classList.remove("error"), 1500);
							}
						}
					);
				});

				header.appendChild(deleteBtn);
			}

			item.appendChild(header);

			item.addEventListener("click", () => {
				chrome.runtime.sendMessage({ type: "openMail", url: msg.href });
				close();
			});

			list.appendChild(item);
		});
	});
});

window.addEventListener("contextmenu", (event) => {
	event.preventDefault();
	event.stopPropagation();
	return false;
});
