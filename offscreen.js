const MAX_AHEAD = 2;
const DEFAULT_MODEL = "eleven_flash_v2_5";
const DEFAULT_CF_MODEL = "@cf/myshell-ai/melotts";
const CF_PCM_RATE = 24000;

let playlist = [];
let current = null;
let currentUrl = null;
let playing = false;
let paused = false;
let finished = false;
let speed = 1;

let cancelled = false;
let runId = 0;
let consumed = 0;
let wake = null;
let state = "idle";
let total = 0;
let processing = 0;
let reading = 0;
let lastFinished = false;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== "offscreen") return;

  if (msg.type === "start") {
    startSession(msg)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "pause") {
    pauseSession();
    sendResponse(snapshot());
    return false;
  }

  if (msg.type === "resume") {
    resumeSession();
    sendResponse(snapshot());
    return false;
  }

  if (msg.type === "stop") {
    stopSession();
    sendResponse(snapshot());
    return false;
  }

  if (msg.type === "getState") {
    sendResponse(snapshot());
    return false;
  }
});

async function startSession({ chunks, provider, cfg, speed: requestedSpeed }) {
  if (!chunks?.length) return { ok: false, error: "No readable text found on this page." };

  cancelled = false;
  const myRun = ++runId;
  wakeFetchLoop();
  stopAll();
  finished = false;
  speed = Number(requestedSpeed) || 1;
  consumed = 0;
  wake = null;
  total = chunks.length;
  processing = 0;
  reading = 0;
  state = "playing";
  lastFinished = false;
  notifyProgress();

  fetchLoop(myRun, chunks, provider, cfg);
  return snapshot();
}

async function fetchLoop(myRun, chunks, provider, cfg) {
  let succeeded = 0;
  let lastError = "";

  for (let i = 0; i < chunks.length; i++) {
    // Backpressure only applies during active playback; while paused we keep
    // synthesizing ahead so resume is instant ("Processing" climbs, "Reading" holds).
    while (!cancelled && myRun === runId && !paused && i - consumed >= MAX_AHEAD) {
      await new Promise((r) => {
        wake = r;
        setTimeout(r, 8000);
      });
    }
    if (cancelled || myRun !== runId) return;

    processing = i + 1;
    notifyProgress();

    // Fetch with one retry — a transient blip shouldn't kill a long read.
    let result = null;
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      try {
        result = await fetchTTS(chunks[i], provider, cfg);
      } catch (e) {
        if (cancelled || myRun !== runId) return;
        lastError = String(e?.message || e);
        console.warn(`[ReadIt] chunk ${i + 1} fetch ${attempt ? "retry " : ""}failed: ${lastError}`);
      }
    }
    if (cancelled || myRun !== runId) return;

    if (!result || !enqueue(result.audio, result.mime, i + 1)) {
      // Nothing has succeeded yet → likely bad credentials/config, so fail loud
      // instead of silently skipping all of it. After the first success, skip.
      if (succeeded === 0) {
        failSession(lastError || `${provider} request failed.`);
        return;
      }
      console.error(`[ReadIt] chunk ${i + 1} skipped after failure`);
      consumed++; // keep backpressure + end-detection accounting consistent
      wakeFetchLoop();
      continue;
    }
    succeeded++;
    console.log(`[ReadIt] chunk ${i + 1}/${chunks.length} ok (${result.mime})`);
  }

  if (!cancelled && myRun === runId) {
    if (succeeded === 0) {
      failSession(lastError || "All audio requests failed.");
      return;
    }
    finished = true;
    maybeEnd();
  }
}

function enqueue(audio, mime, index) {
  let url;
  try {
    url = b64ToUrl(audio, mime);
  } catch (e) {
    console.warn(`[ReadIt] decode failed for chunk ${index}: ${e?.message || e}`);
    return false;
  }
  playlist.push({ url, index });
  if (!playing && !paused) playNext();
  return true;
}

function pauseSession() {
  if (state !== "playing") return;
  paused = true;
  if (current) current.pause();
  state = "paused";
  wakeFetchLoop(); // release backpressure so fetching continues during the pause
}

function resumeSession() {
  if (state !== "paused") return;
  paused = false;
  state = "playing";
  if (current) {
    current.play().catch((e) => {
      if (!paused && e?.name !== "AbortError") failSession("Could not resume playback.");
    });
  } else {
    playNext();
  }
}

function stopSession() {
  cancelled = true;
  runId++;
  stopAll();
  finished = true;
  wakeFetchLoop();
  resetProgress();
  state = "idle";
  lastFinished = false;
  notifyProgress();
}

function failSession(error) {
  cancelled = true;
  stopAll();
  finished = true;
  wakeFetchLoop();
  resetProgress();
  state = "idle";
  lastFinished = false;
  notifyProgress();
  notifyStatus({ status: "error", error });
}

function playNext() {
  if (paused) return;
  if (playlist.length === 0) {
    playing = false;
    maybeEnd();
    return;
  }

  playing = true;
  const { url, index } = playlist.shift();
  reading = index;
  notifyProgress();

  currentUrl = url;
  current = new Audio(url);
  current.playbackRate = speed;

  let settled = false;
  const done = () => {
    if (settled) return;
    settled = true;
    URL.revokeObjectURL(url);
    current = null;
    currentUrl = null;
    consumed++;
    wakeFetchLoop();
    playNext();
  };

  current.onended = done;
  current.onerror = () => {
    console.warn(`[ReadIt] playback error on chunk ${index}, skipping:`, current?.error?.message || "");
    done(); // skip this chunk, keep the read going
  };
  current
    .play()
    .then(() => console.log(`[ReadIt] playing chunk ${index}`))
    .catch((e) => {
      // Pausing before play() resolves rejects with AbortError — not a failure.
      if (paused || e?.name === "AbortError") return;
      console.warn(`[ReadIt] play() failed on chunk ${index}, skipping: ${e?.message || e}`);
      done();
    });
}

function maybeEnd() {
  if (finished && !playing && playlist.length === 0) {
    resetProgress();
    state = "idle";
    lastFinished = true;
    notifyProgress();
    notifyStatus({ status: "idle" });
  }
}

function stopAll() {
  if (current) {
    current.pause();
    current.onended = null;
    current.onerror = null;
    current = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
  playlist.forEach((item) => URL.revokeObjectURL(item.url));
  playlist = [];
  playing = false;
  paused = false;
}

function resetProgress() {
  total = 0;
  processing = 0;
  reading = 0;
  consumed = 0;
  wake = null;
}

function wakeFetchLoop() {
  if (wake) {
    wake();
    wake = null;
  }
}

function notifyProgress() {
  chrome.runtime.sendMessage({ type: "progress", processing, reading, total }).catch(() => {});
}

function notifyStatus(msg) {
  chrome.runtime.sendMessage({ type: "status", ...msg }).catch(() => {});
}

function snapshot() {
  return { ok: true, state, processing, reading, total, lastFinished };
}

function fetchTTS(text, provider, cfg) {
  return provider === "cloudflare" ? fetchCloudflare(text, cfg) : fetchElevenLabs(text, cfg);
}

async function fetchElevenLabs(text, cfg) {
  const url =
    `https://api.elevenlabs.io/v1/text-to-speech/${cfg.voiceId}` +
    `?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": cfg.apiKey, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: cfg.model || DEFAULT_MODEL }),
  });
  if (!res.ok) throw new Error(await providerError("ElevenLabs", res));
  return { audio: bufToBase64(await res.arrayBuffer()), mime: "audio/mpeg" };
}

async function fetchCloudflare(text, cfg) {
  const model = cfg.cfModel || DEFAULT_CF_MODEL;
  const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.cfAccountId}/ai/run/${model}`;
  const headers = {
    authorization: `Bearer ${cfg.cfApiToken}`,
    "content-type": "application/json",
  };
  if (cfg.cfGatewayId) headers["cf-aig-gateway-id"] = cfg.cfGatewayId;

  let body;
  if (/aura|deepgram/i.test(model)) {
    body = { text, encoding: "linear16", sample_rate: CF_PCM_RATE };
    if (cfg.cfSpeaker) body.speaker = cfg.cfSpeaker;
  } else {
    body = { prompt: text, lang: "en" };
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await providerError("Cloudflare", res));

  const ctype = res.headers.get("content-type") || "";
  if (ctype.includes("application/json")) {
    const data = await res.json();
    const audio = data?.result?.audio ?? data?.audio;
    if (!audio) throw new Error("Cloudflare returned no audio.");
    return { audio, mime: "audio/mpeg" };
  }

  let bytes = new Uint8Array(await res.arrayBuffer());
  const isRiff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const isMp3 =
    (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  let mime;
  if (isRiff) {
    mime = "audio/wav";
  } else if (isMp3) {
    mime = "audio/mpeg";
  } else {
    bytes = pcm16ToWav(bytes, CF_PCM_RATE, 1);
    mime = "audio/wav";
  }
  return { audio: bufToBase64(bytes), mime };
}

async function providerError(provider, res) {
  let detail = "";
  try {
    detail = (await res.text()).slice(0, 300).trim();
  } catch {}
  const tail = detail ? `: ${detail}` : res.statusText ? ` ${res.statusText}` : "";
  return `${provider} ${res.status}${tail}`;
}

function pcm16ToWav(pcm, sampleRate, channels) {
  const out = new Uint8Array(44 + pcm.length);
  const dv = new DataView(out.buffer);
  const str = (off, s) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  dv.setUint32(4, 36 + pcm.length, true);
  str(8, "WAVE");
  str(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, channels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * channels * 2, true);
  dv.setUint16(32, channels * 2, true);
  dv.setUint16(34, 16, true);
  str(36, "data");
  dv.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

function bufToBase64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP));
  }
  return btoa(bin);
}

function b64ToUrl(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime || "audio/mpeg" }));
}
