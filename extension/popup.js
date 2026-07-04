const $ = (id) => document.getElementById(id);
const status = (msg, ok) => { const s = $("status"); s.textContent = msg; s.className = "status " + (ok ? "ok" : "err"); };

const DEFAULT_SERVER = "https://project--587b3636-dac3-4081-bfb6-e7028ae194bd.lovable.app";

function detectTool(url) {
  if (/chatgpt\.com|chat\.openai\.com/.test(url)) return "chatgpt";
  if (/claude\.ai/.test(url)) return "claude";
  if (/copilot\.microsoft\.com|m365\.cloud\.microsoft/.test(url)) return "copilot";
  if (/lovable\.dev|lovable\.app/.test(url)) return "lovable";
  return "unknown";
}

function setConn(state, text) {
  const el = $("conn");
  el.className = "conn " + state;
  el.textContent = text;
}

async function checkConnection(server, token) {
  if (!server || !token) { setConn("disconnected", "Not connected — paste server URL and token"); return; }
  try {
    const res = await fetch(`${server}/api/public/extension-status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      setConn("disconnected", `Token rejected (${res.status})`);
      return;
    }
    if (!data.joined) {
      const el = document.getElementById("conn");
      el.className = "conn disconnected";
      el.innerHTML = `Connected — but you haven't picked a destination for captures yet.<br/>
        <a href="#" id="open-dash" style="color:inherit;text-decoration:underline;font-weight:600">Open Charlotte to start a personal log or join a session →</a>`;
      const link = document.getElementById("open-dash");
      if (link) link.onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: `${server}/participant` }); };
      return;
    }
    setConn("connected", `Logging to: ${data.sessionName} (${data.sessionCode})`);
  } catch (e) {
    setConn("disconnected", `Connection failed: ${e.message}`);
  }
}

async function load() {
  const cfg = await chrome.storage.local.get(["server", "token", "code", "paused"]);
  $("server").value = cfg.server || DEFAULT_SERVER;
  $("token").value = cfg.token || "";
  $("code").value = cfg.code || "";
  const paused = !!cfg.paused;
  $("pause").textContent = paused ? "Resume capture" : "Pause capture";
  $("paused-pill").style.display = paused ? "" : "none";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $("tool").textContent = detectTool(tab?.url || "");
  await checkConnection($("server").value.trim().replace(/\/+$/, ""), $("token").value.trim());
}

$("save").onclick = async () => {
  const server = $("server").value.trim().replace(/\/+$/, "");
  const token = $("token").value.trim();
  const code = $("code").value.trim().toUpperCase();
  if (!server || !token) return status("Server URL and token are required", false);
  await chrome.storage.local.set({ server, token, code });
  status("Saved ✓", true);
  await checkConnection(server, token);
};

$("pause").onclick = async () => {
  const cfg = await chrome.storage.local.get(["paused"]);
  const next = !cfg.paused;
  await chrome.storage.local.set({ paused: next });
  $("pause").textContent = next ? "Resume capture" : "Pause capture";
  $("paused-pill").style.display = next ? "" : "none";
  status(next ? "Capture paused" : "Capture resumed", true);
};

$("capture").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return status("No active tab", false);
  status("Capturing…", true);
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { type: "CHARLOTTE_CAPTURE" });
    if (resp?.ok) status(`Captured ${resp.turns} turns ✓`, true);
    else status(`Failed: ${resp?.error || "unknown"}`, false);
  } catch (e) { status(`Error: ${e.message}`, false); }
};

load();
