const fields = [
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
];

const $ = (id) => document.getElementById(id);

const speedSel = $("speed");
for (let r = 0.5; r <= 2.0001; r += 0.1) {
  const v = r.toFixed(1);
  speedSel.add(new Option(`${v}×`, v));
}

function syncProvider() {
  const p = $("provider").value;
  $("elevenlabs-fields").hidden = p !== "elevenlabs";
  $("cloudflare-fields").hidden = p !== "cloudflare";
}
$("provider").addEventListener("change", syncProvider);

async function load() {
  const s = await chrome.storage.local.get(fields);
  $("provider").value = s.provider || "elevenlabs";
  $("apiKey").value = s.apiKey || "";
  $("voiceId").value = s.voiceId || "";
  $("model").value = s.model || "eleven_flash_v2_5";
  $("cfModel").value = s.cfModel || "@cf/myshell-ai/melotts";
  $("cfSpeaker").value = s.cfSpeaker || "";
  $("cfGatewayId").value = s.cfGatewayId || "";
  $("cfAccountId").value = s.cfAccountId || "";
  $("cfApiToken").value = s.cfApiToken || "";
  speedSel.value = s.speed || "1.0";
  syncProvider();
}

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    provider: $("provider").value,
    apiKey: $("apiKey").value.trim(),
    voiceId: $("voiceId").value.trim(),
    model: $("model").value,
    cfModel: $("cfModel").value.trim(),
    cfSpeaker: $("cfSpeaker").value.trim(),
    cfGatewayId: $("cfGatewayId").value.trim(),
    cfAccountId: $("cfAccountId").value.trim(),
    cfApiToken: $("cfApiToken").value.trim(),
    speed: speedSel.value,
  });
  const saved = $("saved");
  saved.textContent = "Saved ✓";
  setTimeout(() => (saved.textContent = ""), 1500);
});

load();
