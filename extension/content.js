// Adapter dispatcher for ChatGPT, Claude, Copilot, Lovable.
function detectTool() {
  const h = location.hostname;
  if (/chatgpt\.com|openai\.com/.test(h)) return "chatgpt";
  if (/claude\.ai/.test(h)) return "claude";
  if (/copilot\.microsoft\.com|m365\.cloud\.microsoft/.test(h)) return "copilot";
  if (/lovable\.dev|lovable\.app/.test(h)) return "lovable";
  return "unknown";
}

function txt(el) { return (el?.innerText || "").trim(); }

const adapters = {
  chatgpt: () => {
    const turns = [];
    document.querySelectorAll('[data-message-author-role]').forEach(n => {
      const role = n.getAttribute('data-message-author-role');
      const content = txt(n);
      if (role && content) turns.push({ role: role === "assistant" ? "assistant" : "user", content });
    });
    return turns;
  },
  claude: () => {
    const turns = [];
    document.querySelectorAll('[data-testid="user-message"], .font-claude-message').forEach(n => {
      const isUser = n.matches('[data-testid="user-message"]');
      const content = txt(n);
      if (content) turns.push({ role: isUser ? "user" : "assistant", content });
    });
    return turns;
  },
  copilot: () => {
    const turns = [];
    document.querySelectorAll('[data-content="user-message"], [data-content="ai-message"]').forEach(n => {
      const isUser = n.getAttribute('data-content') === 'user-message';
      const content = txt(n);
      if (content) turns.push({ role: isUser ? "user" : "assistant", content });
    });
    return turns;
  },
  lovable: () => {
    const turns = [];
    document.querySelectorAll('[data-role="user"], [data-role="assistant"], .message-user, .message-assistant').forEach(n => {
      const role = n.getAttribute('data-role') || (n.classList.contains('message-user') ? 'user' : 'assistant');
      const content = txt(n);
      if (content) turns.push({ role: role === 'assistant' ? 'assistant' : 'user', content });
    });
    return turns;
  },
};

function buildPayload(tool, turns) {
  const firstUser = turns.find(t => t.role === "user")?.content || "";
  const lastAi = [...turns].reverse().find(t => t.role === "assistant")?.content || "";
  return {
    tool,
    url: location.href,
    title: document.title,
    prompt: firstUser.slice(0, 8000),
    response: lastAi.slice(0, 8000),
    turns: turns.map(t => ({ role: t.role, content: t.content.slice(0, 8000) })),
    capturedAt: new Date().toISOString(),
  };
}

function send(payload) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: "CHARLOTTE_SEND", payload }, (resp) => resolve(resp || { ok: false }));
  });
}

async function capture() {
  const tool = detectTool();
  const adapter = adapters[tool];
  if (!adapter) return { ok: false, error: "Unsupported site" };
  const turns = adapter();
  if (!turns.length) return { ok: false, error: "No conversation found on page" };
  const resp = await send(buildPayload(tool, turns));
  if (resp.ok) return { ok: true, turns: turns.length };
  return { ok: false, error: resp.error || `HTTP ${resp.status}` };
}

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg?.type === "CHARLOTTE_CAPTURE") {
    capture().then(sendResponse);
    return true;
  }
});

// ---- Auto-capture on new assistant turns ----
async function hashString(s) {
  const buf = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).slice(0, 12).map(b => b.toString(16).padStart(2, "0")).join("");
}

let lastHash = "";
let pending = null;

async function maybeAutoCapture() {
  const tool = detectTool();
  const adapter = adapters[tool];
  if (!adapter) return;
  const turns = adapter();
  if (!turns.length) return;
  // Only auto-send if the last turn is an assistant message.
  if (turns[turns.length - 1].role !== "assistant") return;
  const sig = await hashString(turns.map(t => `${t.role}:${t.content.length}:${t.content.slice(0,200)}`).join("|"));
  if (sig === lastHash) return;
  lastHash = sig;
  const resp = await send(buildPayload(tool, turns));
  if (!resp.ok) console.debug("[Charlotte] auto-send skipped:", resp.error);
}

const observer = new MutationObserver(() => {
  if (pending) clearTimeout(pending);
  // Debounce: wait until the assistant turn settles.
  pending = setTimeout(maybeAutoCapture, 2500);
});

if (detectTool() !== "unknown") {
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  // First pass after load
  setTimeout(maybeAutoCapture, 3000);
}
