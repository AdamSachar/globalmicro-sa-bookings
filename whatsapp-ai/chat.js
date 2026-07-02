// Family Chat — web test for the WhatsApp AI, no server needed.
//
// A family member opens this page, taps their name, and chats with the AI,
// which replies AS THE HOST using the same persona prompt the real WhatsApp
// bot uses. The browser calls the Anthropic API directly (allowed via the
// anthropic-dangerous-direct-browser-access header), so the only thing needed
// is a Claude API key, stored in localStorage on the device.
//
// Deep links:
//   chat.html?m=<memberId>       open straight into one person's chat
//   chat.html#key=sk-ant-...     pre-load the API key (stored, then removed
//                                from the address bar). Handy for sending the
//                                family ONE link that just works.

const STORAGE_KEY = 'familyWaAi.config.v1';     // shared with the setup UI
const KEY_KEY = 'familyWaAi.apiKey';
const CHAT_KEY_PREFIX = 'familyWaAi.chat.';      // + member id
const AUTH_KEY_PREFIX = 'familyWaAi.auth.';      // + member id -> {pinHash, fails}
const MAX_PIN_FAILS = 5;                         // wrong PINs before question reset
const MODEL = 'claude-sonnet-5';
const MAX_TURNS_SENT = 20;                       // history window sent to the AI

let config = { host: {}, members: [] };
let member = null;      // who is chatting
let history = [];       // [{role, content}]
let sending = false;

// ---------- boot ----------
document.addEventListener('DOMContentLoaded', () => {
    captureKeyFromHash();
    loadConfigFromStorage();
    wireUp();
    route();
});

function captureKeyFromHash() {
    const m = location.hash.match(/[#&]key=([^&]+)/);
    if (m) {
        localStorage.setItem(KEY_KEY, decodeURIComponent(m[1]));
        // Remove the key from the address bar so it isn't shoulder-surfed.
        history_replaceClean();
    }
}

function history_replaceClean() {
    const url = location.pathname + location.search;
    try { window.history.replaceState(null, '', url); } catch (e) { /* ignore */ }
}

function loadConfigFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            config = { host: parsed.host || {}, members: parsed.members || [] };
        }
    } catch (e) { console.warn('bad saved config', e); }
}

function apiKey() { return localStorage.getItem(KEY_KEY) || ''; }

function route() {
    const params = new URLSearchParams(location.search);
    const wanted = params.get('m');
    if (wanted && config.members.length) {
        const m = config.members.find(x => x.id === wanted);
        if (m) { startChat(m); return; }
    }
    showPicker();
}

// ---------- screen 1: picker ----------
function showPicker() {
    document.getElementById('chatScreen').hidden = true;
    document.getElementById('pickScreen').hidden = false;

    const hostName = config.host && config.host.name;
    document.getElementById('pickTitle').textContent = hostName ? `Chat with ${hostName}` : 'Family Chat';

    const list = document.getElementById('pickList');
    list.innerHTML = '';
    const hasMembers = config.members.length > 0;
    document.getElementById('noConfig').hidden = hasMembers;
    document.getElementById('pickSub').hidden = !hasMembers;

    config.members.forEach(m => {
        const btn = document.createElement('button');
        btn.className = 'pick-person';
        btn.innerHTML = `<span class="avatar">${escapeHtml(initials(m.name))}</span> ${escapeHtml(m.name)}`;
        btn.addEventListener('click', () => {
            if (!apiKey()) {
                document.getElementById('keyBox').hidden = false;
                document.getElementById('apiKeyInput').focus();
                pendingMember = m;
                return;
            }
            startChat(m);
        });
        list.appendChild(btn);
    });

    // Show the key box straight away if members exist but no key is saved yet.
    document.getElementById('keyBox').hidden = !(hasMembers && !apiKey());
}

let pendingMember = null;

function saveKey() {
    const v = document.getElementById('apiKeyInput').value.trim();
    if (!v.startsWith('sk-')) { alert('That does not look like an API key (should start with sk-).'); return; }
    localStorage.setItem(KEY_KEY, v);
    document.getElementById('keyBox').hidden = true;
    if (pendingMember) { const m = pendingMember; pendingMember = null; startChat(m); }
}

function importConfigFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(reader.result);
            config = { host: parsed.host || {}, members: parsed.members || [] };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
            showPicker();
        } catch (e) { alert('Not a valid config file: ' + e.message); }
    };
    reader.readAsText(file);
}

// ---------- verification gate: secret question + PIN ----------
// Every login goes through this. First time (or after a PIN reset) the member
// must answer the secret question the host set for them, then create a PIN.
// After that, the PIN unlocks the chat. 5 wrong PINs wipes the PIN and forces
// the secret question again.

let authMember = null;
let authMode = null; // 'question' | 'create' | 'enter'

function loadAuth(id) {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY_PREFIX + id)) || {}; }
    catch (e) { return {}; }
}
function saveAuth(id, rec) {
    localStorage.setItem(AUTH_KEY_PREFIX + id, JSON.stringify(rec));
}

async function hashPin(pin) {
    try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('familyWaAi:' + pin));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        // Very old browser fallback — still better than plain text.
        let h = 0;
        const s = 'familyWaAi:' + pin;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
        return 'weak:' + h;
    }
}

function normalizeAnswer(s) {
    return (s || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.!?,]+$/, '');
}

function hasQuestion(m) {
    return !!(m.secretQuestion && m.secretAnswer);
}

function startChat(m) {
    authMember = m;
    const rec = loadAuth(m.id);
    document.getElementById('pickScreen').hidden = true;
    document.getElementById('chatScreen').hidden = true;
    document.getElementById('authScreen').hidden = false;
    document.getElementById('authTitle').textContent = `Hi ${m.name}!`;
    setAuthMsg('');

    if (rec.pinHash) {
        showAuthPin('enter');
    } else if (hasQuestion(m)) {
        showAuthQuestion();
    } else {
        // Host hasn't set a secret question for this person yet.
        showAuthPin('create',
            `No secret question is set up for you yet — ask ${config.host.name || 'the host'} to add one. For now, just create your PIN.`);
    }
}

function setAuthMsg(text, good) {
    const el = document.getElementById('authMsg');
    el.textContent = text;
    el.className = 'auth-msg' + (good ? ' good' : '');
}

function showAuthQuestion() {
    authMode = 'question';
    document.getElementById('authQuestionBox').hidden = false;
    document.getElementById('authPinBox').hidden = true;
    document.getElementById('authSub').textContent = 'Answer your secret question so we know it’s really you.';
    document.getElementById('authQuestion').textContent = authMember.secretQuestion;
    const input = document.getElementById('authAnswer');
    input.value = '';
    input.focus();
}

function showAuthPin(mode, subText) {
    authMode = mode;
    document.getElementById('authQuestionBox').hidden = true;
    document.getElementById('authPinBox').hidden = false;
    const creating = mode === 'create';
    document.getElementById('authSub').textContent = subText ||
        (creating ? 'Choose a PIN — you’ll use it every time you open the chat.'
                  : 'Enter your PIN to open the chat.');
    document.getElementById('pinLabel').textContent = creating ? 'Create a PIN (4–8 digits)' : 'Enter your PIN';
    document.getElementById('pinBtn').textContent = creating ? 'Set PIN & start chatting' : 'Unlock';
    document.getElementById('pinInput2').hidden = !creating;
    document.getElementById('forgotPinBtn').hidden = creating || !hasQuestion(authMember);
    document.getElementById('pinInput').value = '';
    document.getElementById('pinInput2').value = '';
    document.getElementById('pinInput').focus();
}

function checkAnswer() {
    const given = normalizeAnswer(document.getElementById('authAnswer').value);
    if (!given) return;
    const rec = loadAuth(authMember.id);
    if (given === normalizeAnswer(authMember.secretAnswer)) {
        rec.qFails = 0;
        // Correct — any old PIN is void; they create a fresh one.
        delete rec.pinHash;
        rec.fails = 0;
        saveAuth(authMember.id, rec);
        setAuthMsg('✓ That’s you! Now set your PIN.', true);
        showAuthPin('create');
    } else {
        rec.qFails = (rec.qFails || 0) + 1;
        saveAuth(authMember.id, rec);
        if (rec.qFails >= MAX_PIN_FAILS) {
            setAuthMsg(`Too many wrong answers. Ask ${config.host.name || 'the host'} to check your profile.`);
            document.getElementById('authAnswerBtn').disabled = true;
            setTimeout(() => {
                document.getElementById('authAnswerBtn').disabled = false;
                const r = loadAuth(authMember.id); r.qFails = 0; saveAuth(authMember.id, r);
            }, 60000);
        } else {
            setAuthMsg(`That’s not right (${rec.qFails} of ${MAX_PIN_FAILS} tries). Try again.`);
        }
    }
}

async function submitPin() {
    const pin = document.getElementById('pinInput').value.trim();
    if (!/^\d{4,8}$/.test(pin)) { setAuthMsg('The PIN must be 4 to 8 digits.'); return; }

    const rec = loadAuth(authMember.id);
    if (authMode === 'create') {
        const repeat = document.getElementById('pinInput2').value.trim();
        if (pin !== repeat) { setAuthMsg('The two PINs don’t match — try again.'); return; }
        rec.pinHash = await hashPin(pin);
        rec.fails = 0;
        saveAuth(authMember.id, rec);
        openChat(authMember);
        return;
    }

    // authMode === 'enter'
    if (rec.pinHash === await hashPin(pin)) {
        rec.fails = 0;
        saveAuth(authMember.id, rec);
        openChat(authMember);
    } else {
        rec.fails = (rec.fails || 0) + 1;
        if (rec.fails >= MAX_PIN_FAILS && hasQuestion(authMember)) {
            delete rec.pinHash;
            rec.fails = 0;
            saveAuth(authMember.id, rec);
            setAuthMsg('Too many wrong PINs. Answer your secret question to set a new one.');
            showAuthQuestion();
        } else {
            saveAuth(authMember.id, rec);
            setAuthMsg(`Wrong PIN (${rec.fails} of ${MAX_PIN_FAILS} tries).`);
            document.getElementById('pinInput').value = '';
        }
    }
}

// ---------- screen: chat ----------
function openChat(m) {
    member = m;
    history = loadHistory(m.id);

    document.getElementById('pickScreen').hidden = true;
    document.getElementById('authScreen').hidden = true;
    document.getElementById('chatScreen').hidden = false;

    const hostName = config.host.name || 'Host';
    document.getElementById('chatName').textContent = hostName;
    document.getElementById('chatAvatar').textContent = initials(hostName);
    document.getElementById('chatStatus').textContent = 'online';

    renderAll();
    document.getElementById('msgInput').focus();
}

function loadHistory(id) {
    try {
        const raw = localStorage.getItem(CHAT_KEY_PREFIX + id);
        if (raw) return JSON.parse(raw);
    } catch (e) { /* fresh */ }
    return [];
}

function saveHistory() {
    if (member) localStorage.setItem(CHAT_KEY_PREFIX + member.id, JSON.stringify(history));
}

function renderAll() {
    const box = document.getElementById('messages');
    box.innerHTML = '';
    history.forEach(t => box.appendChild(bubble(t.role === 'user' ? 'me' : 'them', t.content, t.at)));
    scrollDown();
}

function bubble(side, text, at) {
    const div = document.createElement('div');
    div.className = 'msg ' + side;
    div.textContent = text;
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = at || clockNow();
    div.appendChild(time);
    return div;
}

function clockNow() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function scrollDown() {
    const sc = document.getElementById('chatScroll');
    sc.scrollTop = sc.scrollHeight;
}

async function send() {
    if (sending || !member) return;
    const input = document.getElementById('msgInput');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    autoGrow(input);

    const at = clockNow();
    history.push({ role: 'user', content: text, at });
    saveHistory();
    document.getElementById('messages').appendChild(bubble('me', text, at));
    scrollDown();

    sending = true;
    document.getElementById('sendBtn').disabled = true;
    document.getElementById('chatStatus').textContent = 'typing…';
    const typing = document.getElementById('typing');
    typing.hidden = false;
    scrollDown();

    try {
        const reply = await askClaude();
        history.push({ role: 'assistant', content: reply, at: clockNow() });
        saveHistory();
        document.getElementById('messages').appendChild(bubble('them', reply));
    } catch (e) {
        const div = bubble('error', friendlyError(e));
        document.getElementById('messages').appendChild(div);
    } finally {
        typing.hidden = true;
        sending = false;
        document.getElementById('sendBtn').disabled = false;
        document.getElementById('chatStatus').textContent = 'online';
        scrollDown();
    }
}

function friendlyError(e) {
    const msg = String(e && e.message || e);
    if (msg.includes('401') || msg.includes('invalid x-api-key')) {
        localStorage.removeItem(KEY_KEY);
        return '⚠️ The API key was rejected. Reload the page and enter a valid key.';
    }
    if (msg.includes('Failed to fetch')) return '⚠️ No connection — check the internet and try again.';
    return '⚠️ Could not get a reply: ' + msg.slice(0, 200);
}

async function askClaude() {
    const systemPrompt = buildSystemPrompt(config.host, member);
    const turns = history.slice(-MAX_TURNS_SENT).map(t => ({ role: t.role, content: t.content }));

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey(),
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
            model: MODEL,
            max_tokens: 400,
            system: systemPrompt,
            messages: turns,
        }),
    });

    if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`${res.status}: ${t.slice(0, 300)}`);
    }
    const data = await res.json();
    const text = (data.content || []).filter(p => p.type === 'text').map(p => p.text).join('').trim();
    if (!text) throw new Error('empty reply');
    return text;
}

// Mirror of server/prompt.js — keep in sync if you change either.
function buildSystemPrompt(host, member) {
    const lines = [];
    const hostName = host.name || 'the host';
    lines.push(`You are replying to WhatsApp messages ON BEHALF OF ${hostName}.`);
    lines.push(`You ARE ${hostName} in these chats — write in the first person, as them. Never reveal that you are an AI or an assistant.`);
    lines.push('');
    if (host.tone) lines.push(`How ${hostName} writes: ${host.tone}`);
    if (host.about) lines.push(`About ${hostName} (for context, share only when natural): ${host.about}`);
    if (host.signoff) lines.push(`Typical sign-off (use sometimes, not every message): ${host.signoff}`);
    lines.push('');
    lines.push(`You are talking to ${member.name}${member.relationship ? ' (' + member.relationship + ')' : ''}.`);
    if (member.about) lines.push(`About ${member.name}: ${member.about}`);
    if (member.engage) lines.push(`How to chat with ${member.name}: ${member.engage}`);
    if (member.tone) lines.push(`Tone for ${member.name}: ${member.tone}`);
    if (member.topics && member.topics.length) lines.push(`Good topics: ${member.topics.join(', ')}.`);
    if (member.avoid && member.avoid.length) lines.push(`Avoid these topics: ${member.avoid.join(', ')}.`);
    lines.push('');
    lines.push('Rules for every reply:');
    lines.push('- Sound like a real person texting, not a formal assistant. Match the length and rhythm of a normal WhatsApp chat.');
    lines.push('- Reply in the same language the person wrote in.');
    if (host.boundaries) lines.push(`- Hard limits from ${hostName}: ${host.boundaries}`);
    lines.push('- Never invent specific facts, plans, money amounts, or promises. If you are unsure of something only the host would know, keep it warm but vague (e.g. "let me check and come back to you").');
    lines.push('- If the message is urgent, about money, about health emergencies, or clearly needs the real person, do NOT try to handle it — say you will call them shortly.');
    return lines.join('\n');
}

// ---------- misc ----------
function initials(name) {
    const parts = (name || '?').trim().split(/\s+/);
    return ((parts[0][0] || '?') + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 110) + 'px';
}

function wireUp() {
    document.getElementById('sendBtn').addEventListener('click', send);
    const input = document.getElementById('msgInput');
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    input.addEventListener('input', () => autoGrow(input));

    document.getElementById('backBtn').addEventListener('click', () => {
        member = null;
        // Drop any ?m= deep link so the picker actually shows.
        if (location.search) { location.href = 'chat.html'; return; }
        showPicker();
    });

    document.getElementById('clearBtn').addEventListener('click', () => {
        if (!member) return;
        if (!confirm('Clear this test conversation?')) return;
        history = [];
        localStorage.removeItem(CHAT_KEY_PREFIX + member.id);
        renderAll();
    });

    // Verification screen.
    document.getElementById('authAnswerBtn').addEventListener('click', checkAnswer);
    document.getElementById('authAnswer').addEventListener('keydown', e => {
        if (e.key === 'Enter') checkAnswer();
    });
    document.getElementById('pinBtn').addEventListener('click', submitPin);
    ['pinInput', 'pinInput2'].forEach(id =>
        document.getElementById(id).addEventListener('keydown', e => {
            if (e.key === 'Enter') submitPin();
        }));
    document.getElementById('forgotPinBtn').addEventListener('click', () => {
        setAuthMsg('');
        showAuthQuestion();
    });
    document.getElementById('authBackBtn').addEventListener('click', () => {
        authMember = null;
        document.getElementById('authScreen').hidden = true;
        if (location.search) { location.href = 'chat.html'; return; }
        showPicker();
    });

    document.getElementById('saveKeyBtn').addEventListener('click', saveKey);
    document.getElementById('apiKeyInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') saveKey();
    });

    document.getElementById('pickImportBtn').addEventListener('click', () =>
        document.getElementById('pickImportFile').click());
    document.getElementById('pickImportFile').addEventListener('change', e => {
        if (e.target.files[0]) importConfigFile(e.target.files[0]);
        e.target.value = '';
    });
}
