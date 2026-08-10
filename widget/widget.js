/**
 * Skills4Future Chat Widget
 * ---------------------------------------------------------
 * Drop this into any page with:
 *   <script src="widget.js" data-api-url="https://YOUR_BACKEND_URL"></script>
 *
 * It injects a floating chat bubble (bottom-right) that talks to the
 * FastAPI backend's /chat endpoint.
 */
(function () {
  const scriptTag = document.currentScript;
  const API_URL = (scriptTag && scriptTag.getAttribute("data-api-url")) || "http://localhost:8000";

  const SESSION_KEY = "s4f_chat_session_id";
  let sessionId = null; // kept in-memory only (no localStorage per widget sandboxing best practice)

  // ---- Styles ----
  const style = document.createElement("style");
  style.textContent = `
    #s4f-chat-bubble {
      position: fixed; bottom: 24px; right: 24px; width: 60px; height: 60px;
      border-radius: 50%; background: linear-gradient(135deg, #14a34a, #0b6e34);
      color: #fff; border: none;
      cursor: pointer; box-shadow: 0 6px 20px rgba(11,110,52,0.4); z-index: 999999;
      display: flex; align-items: center; justify-content: center; font-size: 26px;
      transition: transform 0.18s ease, box-shadow 0.18s ease;
    }
    #s4f-chat-bubble:hover { transform: scale(1.08); box-shadow: 0 8px 24px rgba(11,110,52,0.5); }
    #s4f-chat-window {
      position: fixed; bottom: 96px; right: 24px; width: 370px; max-width: 92vw;
      height: 540px; max-height: 75vh; background: #fff; border-radius: 18px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.18); z-index: 999999; display: none;
      flex-direction: column; overflow: hidden; font-family: system-ui, -apple-system, sans-serif;
      border: 1px solid rgba(0,0,0,0.06);
    }
    #s4f-chat-header {
      background: linear-gradient(135deg, #14a34a, #0b6e34);
      color: #fff; padding: 18px 18px; font-weight: 600;
      display: flex; justify-content: space-between; align-items: flex-start; font-size: 15.5px;
    }
    #s4f-chat-header small { display:block; font-weight: 400; font-size: 11.5px; opacity: 0.9; margin-top: 4px; line-height: 1.4; }
    #s4f-chat-close {
      background: rgba(255,255,255,0.15); border: none; color: #fff; font-size: 18px;
      cursor: pointer; line-height: 1; width: 26px; height: 26px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      transition: background 0.15s ease;
    }
    #s4f-chat-close:hover { background: rgba(255,255,255,0.28); }
    #s4f-chat-messages {
      flex: 1; overflow-y: auto; padding: 16px; background: #f4f8f5; display: flex; flex-direction: column; gap: 11px;
    }
    .s4f-msg { max-width: 82%; padding: 10px 14px; border-radius: 14px; font-size: 13.5px; line-height: 1.45; white-space: pre-wrap; }
    .s4f-msg.user {
      align-self: flex-end; background: linear-gradient(135deg, #14a34a, #0b6e34);
      color: #fff; border-bottom-right-radius: 4px; box-shadow: 0 2px 8px rgba(11,110,52,0.25);
    }
    .s4f-msg.bot {
      align-self: flex-start; background: #fff; color: #26332a; border: 1px solid #e3ebe4;
      border-bottom-left-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,0.04);
    }
    .s4f-msg.typing { align-self: flex-start; color: #7c8a7f; font-style: italic; }
    #s4f-chat-inputbar { display: flex; border-top: 1px solid #e9ece9; padding: 10px; gap: 8px; background: #fff; }
    #s4f-chat-input {
      flex: 1; border: 1px solid #d8ded9; border-radius: 22px; padding: 10px 16px;
      font-size: 13.5px; outline: none; transition: border-color 0.15s ease;
    }
    #s4f-chat-input:focus { border-color: #14a34a; }
    #s4f-chat-send {
      background: linear-gradient(135deg, #14a34a, #0b6e34); color: #fff; border: none; border-radius: 50%;
      width: 38px; height: 38px; cursor: pointer; font-size: 15px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(11,110,52,0.3); transition: transform 0.15s ease;
    }
    #s4f-chat-send:hover:not(:disabled) { transform: scale(1.06); }
    #s4f-chat-send:disabled { opacity: 0.5; cursor: default; }
    #s4f-chat-messages::-webkit-scrollbar { width: 6px; }
    #s4f-chat-messages::-webkit-scrollbar-thumb { background: #c7d4c9; border-radius: 3px; }
  `;
  document.head.appendChild(style);

  // ---- Markup ----
  const bubble = document.createElement("button");
  bubble.id = "s4f-chat-bubble";
  bubble.setAttribute("aria-label", "Open chat");
  bubble.innerHTML = "💬";

  const win = document.createElement("div");
  win.id = "s4f-chat-window";
  win.innerHTML = `
    <div id="s4f-chat-header">
      <div>Skills4Future Assistant<small>Ask about courses, eligibility, certificates & more</small></div>
      <button id="s4f-chat-close" aria-label="Close chat">×</button>
    </div>
    <div id="s4f-chat-messages"></div>
    <div id="s4f-chat-inputbar">
      <input id="s4f-chat-input" type="text" placeholder="Type your question..." />
      <button id="s4f-chat-send" aria-label="Send">➤</button>
    </div>
  `;

  document.body.appendChild(bubble);
  document.body.appendChild(win);

  const messagesEl = win.querySelector("#s4f-chat-messages");
  const inputEl = win.querySelector("#s4f-chat-input");
  const sendBtn = win.querySelector("#s4f-chat-send");
  const closeBtn = win.querySelector("#s4f-chat-close");

  function addMessage(text, role) {
    const div = document.createElement("div");
    div.className = "s4f-msg " + role;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function toggleWindow(open) {
    win.style.display = open ? "flex" : "none";
    if (open && messagesEl.children.length === 0) {
      addMessage(
        "Hi! I'm the Skills4Future assistant. Ask me about the Foundation or Advanced course, eligibility, certificates, the AICTE internship, or the Faculty Development Program.",
        "bot"
      );
    }
  }

  bubble.addEventListener("click", () => toggleWindow(win.style.display !== "flex"));
  closeBtn.addEventListener("click", () => toggleWindow(false));

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = "";
    sendBtn.disabled = true;
    addMessage(text, "user");

    const typingEl = addMessage("Typing...", "typing");

    try {
      const res = await fetch(API_URL.replace(/\/$/, "") + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, session_id: sessionId }),
      });
      if (!res.ok) throw new Error("Request failed: " + res.status);
      const data = await res.json();
      sessionId = data.session_id;
      typingEl.remove();
      addMessage(data.reply, "bot");
    } catch (err) {
      typingEl.remove();
      addMessage("Sorry, something went wrong. Please try again in a moment, or reach us at skills4future@edunetfoundation.org.", "bot");
      console.error("S4F chat widget error:", err);
    } finally {
      sendBtn.disabled = false;
    }
  }

  sendBtn.addEventListener("click", sendMessage);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });
})();