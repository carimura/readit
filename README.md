# Read It

A minimal Chrome (Manifest V3) extension that reads the current page — or your
selected text — aloud using **[ElevenLabs](https://elevenlabs.io)** or
**[Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)**.

- **Two providers:** **ElevenLabs** (voices/models like `eleven_flash_v2_5`,
  `turbo`, `multilingual_v2`) and **Cloudflare Workers AI** (MeloTTS, Deepgram
  Aura) — pick one in Settings.
- Reads your **selection** if you've highlighted text, otherwise auto-extracts
  the page's main `<article>`/`<main>` content.
- Long pages are chunked and played gaplessly; playback continues after the
  popup closes (audio runs in an offscreen document).
- Provider credentials are stored in `chrome.storage.local` — local to this
  browser, never hardcoded.

## Install (unpacked)

1. Open `chrome://extensions`, enable **Developer mode** (top right).
2. **Load unpacked** → select this `readit/` folder.
3. Click the extension's **Settings** (or the popup's Settings link), pick a **Provider**, and fill in its fields:
   - **ElevenLabs** (default) — API key (`xi-...`) + voice ID + model.
   - **Cloudflare Workers AI** — model (default `@cf/myshell-ai/melotts`), account ID, API token, and optional [AI Gateway](https://developers.cloudflare.com/ai-gateway/) ID (routes the call through your gateway via the `cf-aig-gateway-id` header).
4. Open any article, click the toolbar icon → **Read page**.

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 config, permissions, host access for supported TTS providers |
| `popup.html/js` | Read / Stop UI |
| `options.html/js` | Provider credential, voice/model, and playback settings |
| `background.js` | Extracts readable text and starts the offscreen player |
| `offscreen.html/js` | Fetches TTS chunks and plays audio outside the service worker |

## Notes

- TTS providers bill by usage, so reading full articles can consume credits.
  Selecting just the text you want keeps cost down.
- `activeTab` scope means it only touches a page when you invoke it; it won't
  run on `chrome://` pages or the Web Store.
- No build step — plain JS/HTML.
