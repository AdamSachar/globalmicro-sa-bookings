// Family WhatsApp AI — profile manager (front-end).
// Everything is stored in localStorage on this device. The "Download config"
// button produces a family-config.json that the server (whatsapp-ai/server)
// reads to actually run the WhatsApp bot.
//
// IMPORTANT: the buildSystemPrompt() function below is intentionally a mirror
// of the one in server/prompt.js. If you change how the AI is instructed,
// change it in BOTH places so the preview here matches what the bot really does.

const STORAGE_KEY = 'familyWaAi.config.v1';

// ---------- state ----------
let config = loadConfig();
let editingId = null; // id of member being edited, or null for "new"

// ---------- helpers ----------
function loadConfig() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return normalize(JSON.parse(raw));
    } catch (e) {
        console.warn('Could not read saved config:', e);
    }
    return { host: {}, members: [] };
}

function normalize(c) {
    return {
        host: c.host || {},
        members: Array.isArray(c.members) ? c.members : [],
    };
}

function saveConfig() {
    readHostFromForm();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    flashSaved();
}

let saveTimer = null;
function flashSaved() {
    const el = document.getElementById('saveMsg');
    el.textContent = '✓ Saved on this device';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { el.textContent = ''; }, 1600);
}

// Make a stable-ish id without needing Date.now / crypto everywhere.
function newId() {
    return 'm_' + Math.random().toString(36).slice(2, 9) + (config.members.length + 1);
}

function initials(name) {
    const parts = (name || '?').trim().split(/\s+/);
    return ((parts[0][0] || '?') + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

// Keep only digits — WhatsApp Cloud API identifies senders by digits-only msisdn.
function normalizePhone(raw) {
    return (raw || '').replace(/[^\d]/g, '');
}

function splitList(s) {
    return (s || '').split(',').map(x => x.trim()).filter(Boolean);
}

// ---------- host form ----------
function fillHostForm() {
    const h = config.host || {};
    document.getElementById('hostName').value = h.name || '';
    document.getElementById('hostTone').value = h.tone || '';
    document.getElementById('hostAbout').value = h.about || '';
    document.getElementById('hostBoundaries').value = h.boundaries || '';
    document.getElementById('hostSignoff').value = h.signoff || '';
}

function readHostFromForm() {
    config.host = {
        name: document.getElementById('hostName').value.trim(),
        tone: document.getElementById('hostTone').value.trim(),
        about: document.getElementById('hostAbout').value.trim(),
        boundaries: document.getElementById('hostBoundaries').value.trim(),
        signoff: document.getElementById('hostSignoff').value.trim(),
    };
}

// ---------- member list ----------
function renderMembers() {
    const list = document.getElementById('memberList');
    const count = document.getElementById('memberCount');
    list.innerHTML = '';

    if (!config.members.length) {
        list.innerHTML = '<div class="empty">No family members yet. Tap <strong>+ Add member</strong> to create the first profile.</div>';
        count.textContent = '';
        return;
    }

    count.textContent = `${config.members.length} ${config.members.length === 1 ? 'person' : 'people'} set up`;

    config.members.forEach(m => {
        const row = document.createElement('div');
        row.className = 'member';
        row.tabIndex = 0;
        row.innerHTML = `
            <div class="avatar">${escapeHtml(initials(m.name))}</div>
            <div class="info">
                <div class="name">${escapeHtml(m.name || 'Unnamed')}</div>
                <div class="meta">${escapeHtml(m.relationship || '')}${m.phone ? ' · ' + escapeHtml(m.phone) : ''}</div>
            </div>
            <span class="badge ${m.autoReply ? 'on' : 'off'}">${m.autoReply ? 'Auto' : 'Off'}</span>
        `;
        row.addEventListener('click', () => openModal(m.id));
        row.addEventListener('keydown', e => { if (e.key === 'Enter') openModal(m.id); });
        list.appendChild(row);
    });
}

function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// ---------- modal ----------
function openModal(id) {
    editingId = id || null;
    const m = id ? config.members.find(x => x.id === id) : {};
    document.getElementById('modalTitle').textContent = id ? 'Edit member' : 'Add family member';
    document.getElementById('mName').value = m.name || '';
    document.getElementById('mPhone').value = m.phone || '';
    document.getElementById('mRelationship').value = m.relationship || '';
    document.getElementById('mAbout').value = m.about || '';
    document.getElementById('mEngage').value = m.engage || '';
    document.getElementById('mTone').value = m.tone || '';
    document.getElementById('mTopics').value = (m.topics || []).join(', ');
    document.getElementById('mAvoid').value = (m.avoid || []).join(', ');
    document.getElementById('mAuto').checked = m.autoReply !== false;
    document.getElementById('deleteMemberBtn').hidden = !id;
    document.getElementById('previewOut').hidden = true;
    document.getElementById('memberModal').hidden = false;
    document.getElementById('mName').focus();
}

function closeModal() {
    document.getElementById('memberModal').hidden = true;
    editingId = null;
}

function readMemberFromForm() {
    return {
        id: editingId || newId(),
        name: document.getElementById('mName').value.trim(),
        phone: document.getElementById('mPhone').value.trim(),
        relationship: document.getElementById('mRelationship').value.trim(),
        about: document.getElementById('mAbout').value.trim(),
        engage: document.getElementById('mEngage').value.trim(),
        tone: document.getElementById('mTone').value.trim(),
        topics: splitList(document.getElementById('mTopics').value),
        avoid: splitList(document.getElementById('mAvoid').value),
        autoReply: document.getElementById('mAuto').checked,
    };
}

function saveMember() {
    const m = readMemberFromForm();
    if (!m.name) { alert('Please give this person a name.'); return; }
    // Store the phone normalized as well, so config is server-ready.
    m.phoneDigits = normalizePhone(m.phone);

    const idx = config.members.findIndex(x => x.id === m.id);
    if (idx >= 0) config.members[idx] = m; else config.members.push(m);

    saveConfig();
    renderMembers();
    closeModal();
}

function deleteMember() {
    if (!editingId) return;
    const m = config.members.find(x => x.id === editingId);
    if (!confirm(`Delete ${m ? m.name : 'this member'}? This cannot be undone.`)) return;
    config.members = config.members.filter(x => x.id !== editingId);
    saveConfig();
    renderMembers();
    closeModal();
}

// ---------- prompt preview (mirror of server/prompt.js) ----------
function buildSystemPrompt(host, member) {
    const lines = [];
    lines.push(`You are replying to WhatsApp messages ON BEHALF OF ${host.name || 'the host'}.`);
    lines.push(`You ARE ${host.name || 'the host'} in these chats — write in the first person, as them. Never reveal that you are an AI or an assistant.`);
    lines.push('');

    if (host.tone) lines.push(`How ${host.name || 'the host'} writes: ${host.tone}`);
    if (host.about) lines.push(`About ${host.name || 'the host'} (for context, share only when natural): ${host.about}`);
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
    if (host.boundaries) lines.push(`- Hard limits from ${host.name || 'the host'}: ${host.boundaries}`);
    lines.push('- Never invent specific facts, plans, money amounts, or promises. If you are unsure of something only the host would know, keep it warm but vague (e.g. "let me check and come back to you").');
    lines.push('- If the message is urgent, about money, about health emergencies, or clearly needs the real person, do NOT try to handle it — say you will call them shortly.');

    return lines.join('\n');
}

function previewMember() {
    readHostFromForm();
    const host = config.host;
    const member = readMemberFromForm();
    const out = document.getElementById('previewOut');
    out.textContent = buildSystemPrompt(host, member);
    out.hidden = false;
}

// ---------- export / import ----------
function exportConfig() {
    readHostFromForm();
    const data = JSON.stringify(config, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'family-config.json';
    a.click();
    URL.revokeObjectURL(url);
    flashSaved();
}

function copyConfig() {
    readHostFromForm();
    const data = JSON.stringify(config, null, 2);
    navigator.clipboard.writeText(data).then(() => {
        const el = document.getElementById('saveMsg');
        el.textContent = '✓ Copied config to clipboard';
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => { el.textContent = ''; }, 1800);
    }).catch(() => alert('Could not copy. Try the download button instead.'));
}

function importConfig(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = normalize(JSON.parse(reader.result));
            // Ensure every member has an id.
            parsed.members.forEach(m => { if (!m.id) m.id = newId(); });
            config = parsed;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
            fillHostForm();
            renderMembers();
            flashSaved();
        } catch (e) {
            alert('That file did not look like a valid config. ' + e.message);
        }
    };
    reader.readAsText(file);
}

// ---------- wire up ----------
document.addEventListener('DOMContentLoaded', () => {
    fillHostForm();
    renderMembers();

    // Auto-save host fields on change.
    ['hostName', 'hostTone', 'hostAbout', 'hostBoundaries', 'hostSignoff'].forEach(id => {
        document.getElementById(id).addEventListener('blur', saveConfig);
    });

    document.getElementById('addMemberBtn').addEventListener('click', () => openModal(null));
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('cancelMemberBtn').addEventListener('click', closeModal);
    document.getElementById('saveMemberBtn').addEventListener('click', saveMember);
    document.getElementById('deleteMemberBtn').addEventListener('click', deleteMember);
    document.getElementById('previewBtn').addEventListener('click', previewMember);

    document.getElementById('exportBtn').addEventListener('click', exportConfig);
    document.getElementById('copyBtn').addEventListener('click', copyConfig);
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', e => {
        if (e.target.files[0]) importConfig(e.target.files[0]);
        e.target.value = '';
    });

    // Close modal on backdrop click.
    document.getElementById('memberModal').addEventListener('click', e => {
        if (e.target.id === 'memberModal') closeModal();
    });

    // Register service worker for offline / installable use.
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
});
