const MAX_CHUNK = 2000;
const AURA_CHUNK = 400;
const DEFAULT_CF_MODEL = "@cf/myshell-ai/melotts";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "read") {
    handleRead()
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (["pause", "resume", "stop", "getState"].includes(msg.type)) {
    relayToPlayer(msg)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "status") {
    updateActionStatus(msg);
    return false;
  }
});

async function handleRead() {
  const cfg = await chrome.storage.local.get([
    "provider",
    "apiKey",
    "voiceId",
    "model",
    "cfModel",
    "cfSpeaker",
    "cfGatewayId",
    "cfAccountId",
    "cfApiToken",
    "speed",
  ]);
  const provider = cfg.provider || "elevenlabs";
  const missing = missingSettings(provider, cfg);
  if (missing) return { ok: false, error: missing };

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: false, error: "No active tab." };

  const injected = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractText,
  });
  const text = injected?.[0]?.result;
  if (!text || !text.trim()) return { ok: false, error: "No readable text found on this page." };

  const isAura = provider === "cloudflare" && /aura|deepgram/i.test(cfg.cfModel || DEFAULT_CF_MODEL);
  const chunks = chunkText(text, isAura ? AURA_CHUNK : MAX_CHUNK);

  await ensureOffscreen();
  const res = await sendToOffscreen({
    type: "start",
    provider,
    cfg,
    chunks,
    speed: cfg.speed || "1.0",
  });
  if (res?.ok) updateActionStatus({ status: "playing" });
  return res || { ok: false, error: "Audio player unavailable." };
}

async function relayToPlayer(msg) {
  if (!(await chrome.offscreen.hasDocument())) {
    return { ok: true, state: "idle", processing: 0, reading: 0, total: 0, lastFinished: false };
  }
  return (await sendToOffscreen(msg)) || { ok: false, error: "Audio player unavailable." };
}

function updateActionStatus(msg) {
  if (msg.status === "error") {
    setBadge("!", "#cc0000");
    chrome.action.setTitle({ title: `Read It - ${msg.error || "Error"}` });
  } else {
    setBadge("", null);
    chrome.action.setTitle({ title: "Read It" });
  }
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
}

function missingSettings(provider, cfg) {
  if (provider === "cloudflare") {
    if (!cfg.cfAccountId || !cfg.cfApiToken) {
      return "Set your Cloudflare account ID and API token in Settings.";
    }
    return null;
  }
  if (!cfg.apiKey || !cfg.voiceId) {
    return "Set your ElevenLabs API key and voice ID in Settings.";
  }
  return null;
}

function extractText() {
  const sel = window.getSelection().toString().trim();
  if (sel) return sel;
  const el =
    document.querySelector("article") || document.querySelector("main") || document.body;
  return (el?.innerText || "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chunkText(text, max) {
  text = text.trim();
  if (text.length <= max) return text ? [text] : [];
  const chunks = [];
  let rem = text;
  while (rem.length > max) {
    let pos = rem.lastIndexOf("\n\n", max);
    if (pos > 0) {
      chunks.push(rem.slice(0, pos).trim());
      rem = rem.slice(pos).trim();
      continue;
    }
    pos = rem.lastIndexOf(". ", max);
    if (pos > 0) {
      chunks.push(rem.slice(0, pos + 1).trim());
      rem = rem.slice(pos + 2).trim();
      continue;
    }
    chunks.push(rem.slice(0, max));
    rem = rem.slice(max);
  }
  if (rem.trim()) chunks.push(rem.trim());
  return chunks;
}

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Play synthesized speech audio in the background.",
  });
}

function sendToOffscreen(msg) {
  return chrome.runtime.sendMessage({ target: "offscreen", ...msg });
}
