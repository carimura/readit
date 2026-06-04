# Read It - A Chrome extension that reads the current page (or selection) out loud.

Currently supports [ElevenLabs](https://elevenlabs.io) and [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) (through [AI Gateway](https://developers.cloudflare.com/ai-gateway/)).

Both bring your own key.

Sounds pretty good!

(Future feature: add to a custom podcast built on the fly.)

## More details

- **Two providers:** **ElevenLabs** (voices/models like `eleven_flash_v2_5`,
  `turbo`, `multilingual_v2`) and **Cloudflare Workers AI** (MeloTTS, Deepgram
  Aura) — pick one in Settings.
- Reads your **selection** if you've highlighted text, otherwise auto-extracts
  the page's main `<article>`/`<main>` content.
- Long pages are chunked and played gaplessly; playback continues after the
  popup closes (audio runs in an offscreen document).
  

## Install (unpacked)

Not currently published so here's how to use:

1. Open `chrome://extensions`, enable **Developer mode** (top right).
2. **Load unpacked** → select this `readit/` folder.
3. Click the extension's **Settings** (or the popup's Settings link), pick a **Provider**, and fill in its fields:
   - **ElevenLabs** (default) — API key (`xi-...`) + voice ID + model.
   - **Cloudflare Workers AI** — model (default `@cf/myshell-ai/melotts`), account ID, API token, and optional [AI Gateway](https://developers.cloudflare.com/ai-gateway/) ID (routes the call through your gateway via the `cf-aig-gateway-id` header).
4. Open any article, click the toolbar icon → **Read page**.

