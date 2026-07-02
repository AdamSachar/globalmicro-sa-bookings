// Sends WhatsApp text messages via the Meta WhatsApp Cloud API.
// Uses the built-in global fetch (Node 18+).

const GRAPH_VERSION = process.env.WA_GRAPH_VERSION || 'v21.0';

async function sendText(toNumber, text) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token) throw new Error('WHATSAPP_TOKEN is not set.');
    if (!phoneId) throw new Error('WHATSAPP_PHONE_NUMBER_ID is not set.');

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`;
    const body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toNumber,
        type: 'text',
        text: { preview_url: false, body: text },
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`WhatsApp send ${res.status}: ${t.slice(0, 500)}`);
    }
    return res.json();
}

// Optional: mark an incoming message as read (the blue ticks).
async function markRead(messageId) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) return;
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
            body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }),
        });
    } catch (e) {
        // Non-fatal.
        console.warn('[whatsapp] markRead failed:', e.message);
    }
}

module.exports = { sendText, markRead };
