// Family WhatsApp AI — webhook server.
//
// Receives messages from the Meta WhatsApp Cloud API, finds the matching family
// profile, asks Claude to draft a reply as the host, and sends it back.
//
// Zero dependencies: built-in http + crypto + global fetch (Node 18+).
//
//   GET  /webhook   -> Meta verification handshake
//   POST /webhook   -> incoming messages
//   GET  /health    -> simple health check
//
// Run:  node index.js   (see .env.example for required environment variables)

const http = require('http');
const crypto = require('crypto');

const { findMember, getHost, load } = require('./config');
const { buildSystemPrompt } = require('./prompt');
const { generateReply, MODEL } = require('./ai');
const { sendText, markRead } = require('./whatsapp');
const memory = require('./memory');

const PORT = Number(process.env.PORT || 3000);
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';
const APP_SECRET = process.env.WHATSAPP_APP_SECRET || '';

// De-dupe: WhatsApp retries webhooks; remember recently handled message ids.
const seen = new Map(); // messageId -> expiry timestamp counter
let tick = 0;
function alreadyHandled(id) {
    tick++;
    // Cheap eviction: drop entries older than ~1000 messages.
    for (const [k, v] of seen) if (tick - v > 1000) seen.delete(k);
    if (seen.has(id)) return true;
    seen.set(id, tick);
    return false;
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

// Verify the X-Hub-Signature-256 header if an app secret is configured.
function signatureValid(req, rawBody) {
    if (!APP_SECRET) return true; // not enforced if no secret set
    const sig = req.headers['x-hub-signature-256'];
    if (!sig) return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
        return false;
    }
}

// ---------- core: handle one incoming text message ----------
async function handleMessage(from, text, messageId) {
    const member = findMember(from);
    if (!member) {
        console.log(`[skip] message from unknown number ${from} — not in family config.`);
        return;
    }
    if (member.autoReply === false) {
        console.log(`[skip] auto-reply is OFF for ${member.name}.`);
        return;
    }

    const host = getHost();
    const systemPrompt = buildSystemPrompt(host, member);

    const contactKey = member.key || from;
    memory.append(contactKey, 'user', text);
    const turns = memory.history(contactKey);

    let reply;
    try {
        reply = await generateReply(systemPrompt, turns);
    } catch (e) {
        console.error(`[ai] failed for ${member.name}:`, e.message);
        return; // stay silent rather than send a broken message
    }
    if (!reply) {
        console.warn(`[ai] empty reply for ${member.name}, not sending.`);
        return;
    }

    memory.append(contactKey, 'assistant', reply);

    try {
        if (messageId) await markRead(messageId);
        await sendText(from, reply);
        console.log(`[reply] -> ${member.name} (${from}): ${reply.slice(0, 80)}${reply.length > 80 ? '…' : ''}`);
    } catch (e) {
        console.error(`[send] failed to ${member.name}:`, e.message);
    }
}

// Walk the webhook payload and pull out text messages.
function extractMessages(payload) {
    const out = [];
    const entries = payload.entry || [];
    for (const entry of entries) {
        for (const change of entry.changes || []) {
            const value = change.value || {};
            for (const msg of value.messages || []) {
                if (msg.type === 'text' && msg.text) {
                    out.push({ from: msg.from, text: msg.text.body, id: msg.id });
                } else if (msg.from) {
                    // Non-text (image/voice/etc.) — acknowledge but don't try to reply.
                    out.push({ from: msg.from, text: null, id: msg.id, type: msg.type });
                }
            }
        }
    }
    return out;
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, model: MODEL }));
    }

    // Meta verification handshake.
    if (req.method === 'GET' && url.pathname === '/webhook') {
        const mode = url.searchParams.get('hub.mode');
        const token = url.searchParams.get('hub.verify_token');
        const challenge = url.searchParams.get('hub.challenge');
        if (mode === 'subscribe' && token && token === VERIFY_TOKEN) {
            res.writeHead(200, { 'content-type': 'text/plain' });
            return res.end(challenge || '');
        }
        res.writeHead(403);
        return res.end('verification failed');
    }

    // Incoming messages.
    if (req.method === 'POST' && url.pathname === '/webhook') {
        const raw = await readBody(req);

        if (!signatureValid(req, raw)) {
            console.warn('[webhook] invalid signature, rejecting.');
            res.writeHead(401);
            return res.end('bad signature');
        }

        // Always ack fast so Meta doesn't retry; process after responding.
        res.writeHead(200);
        res.end('ok');

        let payload;
        try {
            payload = JSON.parse(raw.toString('utf8') || '{}');
        } catch (e) {
            console.warn('[webhook] bad JSON:', e.message);
            return;
        }

        for (const m of extractMessages(payload)) {
            if (m.id && alreadyHandled(m.id)) continue;
            if (m.text == null) {
                console.log(`[skip] non-text (${m.type}) message from ${m.from}.`);
                continue;
            }
            // Fire and forget — errors are logged inside handleMessage.
            handleMessage(m.from, m.text, m.id).catch(e =>
                console.error('[handle] unexpected error:', e));
        }
        return;
    }

    res.writeHead(404);
    res.end('not found');
});

// Fail fast with a clear message if the config file is missing/broken.
try {
    const cfg = load();
    console.log(`[config] loaded host "${cfg.host.name || '(unnamed)'}" with ${cfg.members.length} family member(s).`);
} catch (e) {
    console.error('[config] ' + e.message);
    process.exit(1);
}

server.listen(PORT, () => {
    console.log(`Family WhatsApp AI listening on :${PORT} (model: ${MODEL})`);
    if (!VERIFY_TOKEN) console.warn('[warn] WHATSAPP_VERIFY_TOKEN not set — webhook verification will fail.');
    if (!APP_SECRET) console.warn('[warn] WHATSAPP_APP_SECRET not set — request signatures are NOT being verified.');
});
