//================================================================
// Popup - Manifest V3 (message passing)
//================================================================
"use strict";

// Wire menu items to background actions; each closes the popup afterwards.
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
	chrome.runtime.sendMessage({ type: "getMessages" }, (messages) => {
		const list = document.getElementById("messageList");
		list.innerHTML = "";

		if (!messages || messages.length === 0) {
			const div = document.createElement("div");
			div.className = "no-messages";
			div.textContent = I18N.getMessage("statusEmpty") || "No unread messages";
			list.appendChild(div);
			return;
		}

		messages.forEach(msg => {
			const item = document.createElement("div");
			item.className = "email-item" + (msg.isUnread ? " unread" : "");

			const header = document.createElement("div");
			header.className = "email-header";

			const sender = document.createElement("div");
			sender.className = "email-sender";
			sender.textContent = msg.sender || "";

			header.appendChild(sender);

			const subject = document.createElement("div");
			subject.className = "email-subject";
			subject.textContent = msg.subject || "(No subject)";

			const snippet = document.createElement("div");
			snippet.className = "email-snippet";
			snippet.textContent = msg.snippet || "";

			const actions = document.createElement("div");
			actions.className = "email-actions";

			const openBtn = document.createElement("div");
			openBtn.className = "email-btn primary";
			openBtn.textContent = I18N.getMessage("openMail") || "Open";
			openBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				chrome.runtime.sendMessage({ type: "openMail", url: msg.href });
				close();
			});

			actions.appendChild(openBtn);

			item.addEventListener("click", () => {
				item.classList.toggle("expanded");
			});

			item.appendChild(header);
			item.appendChild(subject);
			item.appendChild(snippet);
			item.appendChild(actions);

			list.appendChild(item);
		});
	});
});

window.addEventListener("contextmenu", (event) => {
	event.preventDefault();
	event.stopPropagation();
	return false;
});
