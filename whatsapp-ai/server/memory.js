// Very small per-contact conversation memory so replies have context.
// Kept in memory, with an optional JSON file so history survives restarts.
// This is deliberately simple — it is a family bot, not a data warehouse.

const fs = require('fs');
const path = require('path');

const STORE_PATH = process.env.MEMORY_PATH || path.join(__dirname, '.memory.json');
const MAX_TURNS = Number(process.env.MEMORY_MAX_TURNS || 20); // messages kept per contact

let store = {};

// Load once at startup.
try {
    if (fs.existsSync(STORE_PATH)) {
        store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) || {};
    }
} catch (e) {
    console.warn('[memory] could not read store, starting fresh:', e.message);
    store = {};
}

let flushTimer = null;
function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        try {
            fs.writeFileSync(STORE_PATH, JSON.stringify(store));
        } catch (e) {
            console.warn('[memory] could not write store:', e.message);
        }
    }, 500);
}

function history(contactKey) {
    return store[contactKey] || [];
}

function append(contactKey, role, content) {
    if (!store[contactKey]) store[contactKey] = [];
    store[contactKey].push({ role, content });
    // Trim to the last MAX_TURNS messages.
    if (store[contactKey].length > MAX_TURNS) {
        store[contactKey] = store[contactKey].slice(-MAX_TURNS);
    }
    scheduleFlush();
}

module.exports = { history, append };
