// Loads the family-config.json produced by the setup UI and lets the bot look
// up a family member by the WhatsApp number a message came from.

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = process.env.FAMILY_CONFIG_PATH
    || path.join(__dirname, 'family-config.json');

let cache = null;
let cacheMtime = 0;

function digitsOnly(s) {
    return (s || '').replace(/[^\d]/g, '');
}

function load() {
    // Reload if the file changed on disk, so you can update profiles without
    // restarting the server.
    let stat;
    try {
        stat = fs.statSync(CONFIG_PATH);
    } catch (e) {
        throw new Error(`Family config not found at ${CONFIG_PATH}. Download it from the setup UI and place it here (or set FAMILY_CONFIG_PATH).`);
    }
    if (cache && stat.mtimeMs === cacheMtime) return cache;

    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const host = parsed.host || {};
    const members = (parsed.members || []).map(m => ({
        ...m,
        // Precompute a digits-only key for matching incoming numbers.
        key: digitsOnly(m.phoneDigits || m.phone),
    }));

    cache = { host, members };
    cacheMtime = stat.mtimeMs;
    return cache;
}

// Match an incoming WhatsApp number (digits only, e.g. "27821234567") to a
// member. Uses suffix matching so a saved "+27 82 123 4567" still matches a
// "27821234567" from the webhook even if leading digits differ slightly.
function findMember(fromNumber) {
    const { members } = load();
    const from = digitsOnly(fromNumber);
    if (!from) return null;

    // Exact match first, then longest-suffix match (min 7 digits to be safe).
    let exact = members.find(m => m.key && m.key === from);
    if (exact) return exact;

    return members.find(m => {
        if (!m.key) return false;
        const a = from, b = m.key;
        const short = Math.min(a.length, b.length);
        if (short < 7) return false;
        return a.slice(-short) === b.slice(-short);
    }) || null;
}

function getHost() {
    return load().host;
}

module.exports = { load, findMember, getHost, digitsOnly, CONFIG_PATH };
