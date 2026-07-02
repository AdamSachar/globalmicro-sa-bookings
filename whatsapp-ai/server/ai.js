// Generates a reply with Claude (Anthropic Messages API).
// Uses the built-in global fetch (Node 18+). No SDK / dependencies needed.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const MAX_TOKENS = Number(process.env.AI_MAX_TOKENS || 400);

// systemPrompt: string of persona/instructions (from prompt.js)
// turns: [{ role: 'user'|'assistant', content: string }, ...] recent history,
//        ending with the newest incoming user message.
async function generateReply(systemPrompt, turns) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');

    const body = {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: turns.map(t => ({ role: t.role, content: t.content })),
    };

    const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 500)}`);
    }

    const data = await res.json();
    const parts = Array.isArray(data.content) ? data.content : [];
    const text = parts.filter(p => p.type === 'text').map(p => p.text).join('').trim();
    return text || null;
}

module.exports = { generateReply, MODEL };
