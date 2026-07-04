// Forwards capture payloads from content scripts to the Charlotte server.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "CHARLOTTE_SEND") return;
  (async () => {
    const { server, token, code, paused } = await chrome.storage.local.get(["server", "token", "code", "paused"]);
    if (paused) return sendResponse({ ok: false, error: "paused" });
    if (!server || !token) return sendResponse({ ok: false, error: "Not configured" });
    try {
      const res = await fetch(`${server}/api/public/capture-conversation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ ...msg.payload, joinCode: code || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      sendResponse({ ok: res.ok, status: res.status, body: json });
    } catch (e) { sendResponse({ ok: false, error: e.message }); }
  })();
  return true;
});
