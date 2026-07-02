# Granted — Grant's family line

> *Sessions with Grant, for a family that should never be taken for granted.*
> Grant is the family's psychologist-counsellor; **Granted** is his
> always-open door.

A WhatsApp bot that **replies to your family as you**, using an AI. You describe
yourself once (the *host*), then write a short **profile for each family member** —
who they are and how the AI should chat to them. When a family member messages
your WhatsApp number, the bot looks up their profile and answers in your voice.

There are two pieces:

| Piece | What it is | Where it runs |
|-------|-----------|---------------|
| **Setup UI** (`index.html`, `app.js`, …) | A small phone-friendly web app where you fill in your details and each family member's profile, then download a `family-config.json`. | Static site — same as the rest of this repo (GitHub Pages / open the file). Your data stays on your device. |
| **Server** (`server/`) | The actual bot: a tiny Node service that receives WhatsApp messages, asks Claude for a reply using the right profile, and sends it back. | A machine that's always on (a small VPS, Railway, Render, Fly.io, a Raspberry Pi…). |

> The setup UI **cannot** send WhatsApp messages by itself — a browser can't stay
> online 24/7 or receive webhooks. The server does the real work; the UI just
> builds its config.

---

## Try it first — the web test chat (no WhatsApp, no server)

`chat.html` is a WhatsApp-style chat that runs entirely in the browser, using the
**exact same personas** as the real bot. It's the fastest way to test the whole
idea end-to-end with your family:

1. Fill in profiles in the setup UI (or just to look around, load
   `server/family-config.example.json` when the chat asks).
2. Open `whatsapp-ai/chat.html` on the hosted site.
3. Enter a Claude API key once (from console.anthropic.com — stored only on the
   device).
4. Tap your name and chat. The AI replies as the host, per that person's profile.

Sharing with family:

- Each person opens the same URL on their phone; profiles must be on their
  device too (send them your `family-config.json` to load, or set it up for
  them once).
- Deep links: `chat.html?m=<memberId>` opens straight into one person's chat,
  and `chat.html#key=sk-ant-...` pre-loads the API key then removes it from the
  address bar — so you can send one link that just works. **Anyone with that
  link can use your key**, so only share it with family and revoke the key at
  console.anthropic.com when the test is done.

Test conversations stay in the phone's browser storage (🗑 in the chat clears
one). Nothing goes to WhatsApp; the only network calls are to the Claude API.

### Login verification (secret question + host OTP + PIN)

Each family member must prove who they are before the chat opens:

1. **First login on a device:** they are asked the **secret question** you set
   for them in their profile (e.g. *"Where did we go fishing every December?"*).
   Answers are checked ignoring case and extra spaces. After 5 wrong answers
   the screen locks for a minute.
2. **The host vouches with a login code (OTP):** the member taps a button that
   opens WhatsApp to the host ("please send me my Granted login code"). The
   host reads the member's current 6-digit code off the **🔑 Login codes**
   panel in the setup app and WhatsApps it back — **to the member's own
   number**, which is what proves it's really them. Codes roll every
   10 minutes (the previous code is accepted briefly so a just-sent code
   doesn't expire mid-typing). No server involved: both apps derive the code
   from a per-member secret in the config.
3. **They then create their own PIN** (4–8 digits). The PIN is stored only on
   that device, as a hash.
4. **Every login after that:** just the PIN — unless the host enables
   *"Ask for my code on every login"* in the setup app, in which case each
   login is PIN + a fresh code from the host. 5 wrong PINs wipes the PIN and
   forces the secret question + code again; the "Forgot your PIN?" link does
   the same.

Set your WhatsApp number in the host profile so the "Ask for my code" button
can open a chat to you directly.

Set the question/answer per member in the setup UI (members without one show
"no secret question yet" in the list — they can only be protected by a PIN, so
add a question for everyone). Note this is honest-family security: it keeps
siblings from chatting as each other, but the answers live inside the config
file, so only share that file with people you trust.

The setup UI starts pre-loaded with profiles for: Eric, Estelle, Wayne, Dean,
Andy, Billy, Nicky, Adam, Aaron and Lungi — tap each to fill in their details
and secret question.

---

## 1. Fill in profiles (the Setup UI)

1. Open `whatsapp-ai/index.html` (host it on GitHub Pages, or just open the file).
2. Under **You — the host**, describe yourself: your name, how you write, a bit
   about you, and any **hard rules** (e.g. *never agree to send money*).
3. Tap **+ Add member** for each family member. Fill in their name, their
   **WhatsApp number (with country code)**, who they are, and how the AI should
   chat to them. Use **🔎 Preview** to see exactly what the AI will be told.
4. Tap **⬇️ Download config file** to get `family-config.json`.

Everything is saved on your device automatically. Use **Load a config file** to
bring it back later or move it to another phone/computer.

---

## 2. Set up WhatsApp (Meta Cloud API)

The server uses the official **WhatsApp Business Cloud API** (free tier is fine
for family use).

1. Create a Meta app at <https://developers.facebook.com> → add the **WhatsApp**
   product.
2. From **WhatsApp → API setup**, note your **Phone number ID** and generate an
   access **token** (create a permanent token via a System User for real use).
3. From **App → Settings → Basic**, note the **App secret**.

You'll point WhatsApp's webhook at your server in step 4.

---

## 3. Run the server

Requires **Node.js 18+** (no `npm install` needed — zero dependencies).

```bash
cd whatsapp-ai/server

# put the file you downloaded from the Setup UI here:
cp ~/Downloads/family-config.json ./family-config.json

# configure secrets:
cp .env.example .env      # then edit .env and fill in the values

# load env vars and start:
set -a; . ./.env; set +a
npm start
```

You should see:

```
[config] loaded host "Grant" with 2 family member(s).
Family WhatsApp AI listening on :3000 (model: claude-sonnet-5)
```

**Test it without WhatsApp** (checks your API key and the personas):

```bash
node test-reply.js "Mom" "Hi my boy, did you eat?"
# or by number:
node test-reply.js "27821112222" "how are the kids?"
```

### Required environment variables

See `.env.example` for the full list. The important ones:

| Variable | What it is |
|----------|-----------|
| `ANTHROPIC_API_KEY` | Your Claude API key (from console.anthropic.com). |
| `WHATSAPP_TOKEN` | Access token from Meta. |
| `WHATSAPP_PHONE_NUMBER_ID` | Your WhatsApp number's ID from Meta. |
| `WHATSAPP_VERIFY_TOKEN` | Any secret string you make up — used in step 4. |
| `WHATSAPP_APP_SECRET` | App secret from Meta (verifies incoming requests are real). |

---

## 4. Connect the webhook

Your server must be reachable over **HTTPS**. In development, use a tunnel:

```bash
npx localtunnel --port 3000      # or: ngrok http 3000
```

In production, deploy to a host that gives you an HTTPS URL (Railway, Render,
Fly.io, a VPS behind Caddy/Nginx, …).

Then in the Meta app → **WhatsApp → Configuration → Webhook**:

- **Callback URL:** `https://your-server/webhook`
- **Verify token:** the same string you put in `WHATSAPP_VERIFY_TOKEN`
- Click **Verify and save** (the server answers the handshake automatically).
- **Subscribe** to the **`messages`** field.

Now message your WhatsApp number from a phone whose number is in your config —
the bot replies as you. 🎉

---

## How it works

```
Family member texts your WhatsApp number
        │
        ▼
Meta Cloud API  ──POST──▶  server/index.js  (/webhook)
                                │
                                │ 1. verify signature (app secret)
                                │ 2. find member by phone number  (config.js)
                                │ 3. build persona prompt         (prompt.js)
                                │ 4. add recent chat history      (memory.js)
                                │ 5. ask Claude for a reply       (ai.js)
                                │ 6. send the reply               (whatsapp.js)
                                ▼
                    Reply arrives in their WhatsApp, in your voice
```

- **Only numbers in your config get answered.** Anyone else is ignored.
- **Per-person auto-reply toggle** — turn a person off without deleting them.
- **Short-term memory** — the last ~20 messages per contact are kept (in
  `.memory.json`) so replies have context. Delete that file to wipe history.
- **Safety rails** — the AI is told never to promise money/plans, never to
  invent facts only you'd know, and to defer to the real you for anything
  urgent. Set your own hard limits in the host **Rules** field.

## Files

```
whatsapp-ai/
├── index.html, app.js, style.css   Setup UI (profiles → family-config.json)
├── chat.html, chat.js, chat.css    Web test chat (browser-only, no server)
├── manifest.json, sw.js, icon.svg  Makes the UI installable / offline
└── server/
    ├── index.js                    Webhook server (start here)
    ├── config.js                   Loads family-config.json, matches numbers
    ├── prompt.js                   Builds the persona prompt (mirror of app.js)
    ├── ai.js                       Calls Claude
    ├── whatsapp.js                 Sends WhatsApp messages
    ├── memory.js                   Per-contact short-term memory
    ├── test-reply.js               Try a reply from the command line
    ├── .env.example                Copy to .env and fill in
    └── family-config.example.json  Example of what the UI produces
```

## Notes & responsible use

- Tell your family that replies may be AI-assisted if that matters to you — this
  is a tool for staying in touch, not for deceiving people about important
  things.
- Keep `.env` and your real `family-config.json` private — they're already in
  `.gitignore` so they won't be committed.
- This uses the **official** WhatsApp Business API, so no ban risk — but it does
  mean messages come from a WhatsApp *Business* number, not your personal one.
