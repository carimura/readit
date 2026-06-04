const actionBtn = document.getElementById("action");
const stopBtn = document.getElementById("stop");
const statusEl = document.getElementById("status");
const progressEl = document.getElementById("progress");
const procEl = document.getElementById("proc");
const readEl = document.getElementById("read");

let state = "idle";
let lastFinished = false;

function render() {
  if (state === "playing") {
    actionBtn.textContent = "⏸ Pause";
    actionBtn.classList.remove("primary");
    stopBtn.hidden = false;
  } else if (state === "paused") {
    actionBtn.textContent = "▶ Resume";
    actionBtn.classList.add("primary");
    stopBtn.hidden = false;
  } else {
    actionBtn.textContent = lastFinished ? "↻ Replay" : "▶ Read page";
    actionBtn.classList.add("primary");
    stopBtn.hidden = true;
  }
}

function showProgress({ processing, reading, total }) {
  if (!total) {
    progressEl.hidden = true;
    return;
  }
  progressEl.hidden = false;
  procEl.textContent = `Processing: ${processing || 0}/${total} segments`;
  readEl.textContent = `Reading: ${reading || 0}/${total} segments`;
}

actionBtn.addEventListener("click", async () => {
  const type = state === "playing" ? "pause" : state === "paused" ? "resume" : "read";
  const res = await chrome.runtime.sendMessage({ type });
  if (type === "read" && !res?.ok) {
    statusEl.textContent = res?.error || "Failed.";
    return;
  }
  state = res?.state || state;
  if (type === "read") {
    lastFinished = false;
    statusEl.textContent = "";
  } else if (type === "pause") {
    statusEl.textContent = "Paused.";
  } else {
    statusEl.textContent = "";
  }
  render();
});

stopBtn.addEventListener("click", async () => {
  const res = await chrome.runtime.sendMessage({ type: "stop" });
  state = res?.state || "idle";
  lastFinished = false;
  statusEl.textContent = "Stopped.";
  showProgress({ total: 0 });
  render();
});

document.getElementById("opts").addEventListener("click", () => chrome.runtime.openOptionsPage());

// Live updates while the popup is open (playback continues even after it closes).
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "progress") {
    showProgress(msg);
  } else if (msg.type === "status") {
    if (msg.status === "idle") {
      state = "idle";
      lastFinished = true;
      statusEl.textContent = "Done.";
      showProgress({ total: 0 });
      render();
    } else if (msg.status === "error") {
      state = "idle";
      statusEl.textContent = msg.error || "Error.";
      render();
    }
  }
});

// Reflect whatever is happening when the popup is (re)opened.
(async () => {
  const res = await chrome.runtime.sendMessage({ type: "getState" });
  state = res?.state || "idle";
  lastFinished = res?.lastFinished || false;
  showProgress(res || { total: 0 });
  render();
})();
