/* Till Slips — Catering
   A simple, offline app to capture till slips (receipts) into named jobs.
   All data stays on this phone (saved in the browser). Nothing is sent anywhere.

   Built to be gentle for an older user:
   - big buttons, one task per screen
   - everything auto-saves
   - totals add up automatically
*/

'use strict';

// ---------- Storage ----------
const STORE_KEY = 'catering_jobs_v1';

// Categories tuned for a small catering business (from real catering bookkeeping).
const CATEGORIES = [
    'Groceries / Food',
    'Meat & Poultry',
    'Fruit & Veg',
    'Drinks',
    'Packaging & Disposables',
    'Equipment / Hire',
    'Transport / Fuel',
    'Staff / Helpers',
    'Venue / Decor',
    'Other'
];

let state = {
    jobs: load(),
    currentJobId: null,   // job being viewed
    editingSlipId: null,  // slip being added/edited
    pendingPhoto: null    // data URL of a photo chosen but not yet saved
};

function load() {
    try {
        const raw = localStorage.getItem(STORE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function save() {
    try {
        localStorage.setItem(STORE_KEY, JSON.stringify(state.jobs));
        return true;
    } catch (e) {
        // Most likely the phone's storage is full (usually because of photos).
        toast('Storage is full. Try removing a photo or making a backup.');
        return false;
    }
}

// ---------- Money helpers ----------
const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
function R(n) { return money.format(Number(n) || 0); }

function jobTotal(job) {
    return job.slips.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
}

// ---------- Navigation ----------
const screens = {
    home: document.getElementById('screen-home'),
    job: document.getElementById('screen-job'),
    slip: document.getElementById('screen-slip')
};
let history = ['home'];

function show(name) {
    Object.keys(screens).forEach(k => { screens[k].hidden = (k !== name); });
    const back = document.getElementById('backBtn');
    back.hidden = (name === 'home');
    const titles = { home: 'My Jobs', job: 'Job', slip: 'Till Slip' };
    document.getElementById('topTitle').textContent = titles[name];
    window.scrollTo(0, 0);
}

function goTo(name) {
    history.push(name);
    show(name);
}

function goBack() {
    if (history.length > 1) history.pop();
    const name = history[history.length - 1];
    if (name === 'home') renderHome();
    if (name === 'job') renderJob();
    show(name);
}
document.getElementById('backBtn').addEventListener('click', goBack);

// ---------- Home screen ----------
function renderHome() {
    const list = document.getElementById('jobsList');
    const empty = document.getElementById('homeEmpty');
    const card = document.getElementById('grandTotalCard');
    list.innerHTML = '';

    if (state.jobs.length === 0) {
        empty.hidden = false;
        card.hidden = true;
    } else {
        empty.hidden = true;
        let grand = 0;
        // newest job first
        [...state.jobs].reverse().forEach(job => {
            const total = jobTotal(job);
            grand += total;
            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'card';
            el.onclick = () => openJob(job.id);
            el.innerHTML =
                '<span class="left">' +
                    '<span class="title">' + esc(job.name) + '</span>' +
                    '<span class="meta">' + job.slips.length + ' slip' +
                        (job.slips.length === 1 ? '' : 's') + ' · ' + esc(job.date) + '</span>' +
                '</span>' +
                '<span class="amount">' + R(total) + '</span>' +
                '<span class="chev">&#8250;</span>';
            list.appendChild(el);
        });
        document.getElementById('grandTotalValue').textContent = R(grand);
        card.hidden = false;
    }
}

function newJob() {
    const name = prompt('Name this job\n(e.g. "Smith Wedding" or "Church Lunch"):');
    if (name === null) return;
    const clean = name.trim();
    if (!clean) return;
    const job = {
        id: 'j' + Date.now(),
        name: clean,
        date: todayNice(),
        slips: [],
        markup: ''
    };
    state.jobs.push(job);
    save();
    openJob(job.id);
}

// ---------- Job screen ----------
function openJob(id) {
    state.currentJobId = id;
    history = ['home', 'job'];
    renderJob();
    show('job');
}

function currentJob() {
    return state.jobs.find(j => j.id === state.currentJobId);
}

function renderJob() {
    const job = currentJob();
    if (!job) { goBack(); return; }

    document.getElementById('jobName').textContent = job.name;
    const total = jobTotal(job);
    document.getElementById('jobTotal').textContent = R(total);
    document.getElementById('jobSub').textContent =
        job.slips.length + ' slip' + (job.slips.length === 1 ? '' : 's');
    document.getElementById('topTitle').textContent = job.name;

    const list = document.getElementById('slipsList');
    const empty = document.getElementById('jobEmpty');
    list.innerHTML = '';

    if (job.slips.length === 0) {
        empty.hidden = false;
    } else {
        empty.hidden = true;
        // newest slip first
        [...job.slips].reverse().forEach(slip => {
            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'card slip';
            el.onclick = () => editSlip(slip.id);
            const thumb = slip.photo
                ? '<img class="thumb" src="' + slip.photo + '" alt="">'
                : '';
            const note = slip.note ? ' · ' + esc(slip.note) : '';
            el.innerHTML =
                thumb +
                '<span class="left">' +
                    '<span class="title">' + esc(slip.shop || 'Slip') + '</span>' +
                    '<span class="meta">' + esc(slip.date || '') + note + '</span>' +
                    '<span class="tag">' + esc(slip.category) + '</span>' +
                '</span>' +
                '<span class="amount">' + R(slip.amount) + '</span>';
            list.appendChild(el);
        });
    }

    // price helper
    document.getElementById('markupInput').value = job.markup || '';
    updatePrice();
}

function updatePrice() {
    const job = currentJob();
    if (!job) return;
    const cost = jobTotal(job);
    const markupVal = document.getElementById('markupInput').value;
    const markup = parseFloat(markupVal) || 0;
    job.markup = markupVal;
    save();
    document.getElementById('priceCost').textContent = R(cost);
    document.getElementById('priceCharge').textContent = R(cost * (1 + markup / 100));
}

function deleteJob() {
    const job = currentJob();
    if (!job) return;
    if (!confirm('Delete the whole job "' + job.name + '" and all its slips?\nThis cannot be undone.')) return;
    state.jobs = state.jobs.filter(j => j.id !== job.id);
    save();
    history = ['home'];
    renderHome();
    show('home');
    toast('Job deleted');
}

// ---------- Slip screen ----------
function buildCategoryOptions() {
    const sel = document.getElementById('slipCategory');
    sel.innerHTML = '';
    CATEGORIES.forEach(c => {
        const o = document.createElement('option');
        o.value = c; o.textContent = c;
        sel.appendChild(o);
    });
}

function addSlip() {
    state.editingSlipId = null;
    state.pendingPhoto = null;
    document.getElementById('slipForm').reset();
    document.getElementById('slipDate').value = todayISO();
    document.getElementById('slipCategory').value = CATEGORIES[0];
    document.getElementById('slipDelete').hidden = true;
    clearPhoto();
    goTo('slip');
    setTimeout(() => document.getElementById('slipAmount').focus(), 120);
}

function editSlip(id) {
    const job = currentJob();
    const slip = job.slips.find(s => s.id === id);
    if (!slip) return;
    state.editingSlipId = id;
    state.pendingPhoto = slip.photo || null;
    document.getElementById('slipAmount').value = slip.amount;
    document.getElementById('slipShop').value = slip.shop || '';
    document.getElementById('slipCategory').value = slip.category || CATEGORIES[0];
    document.getElementById('slipDate').value = slip.dateISO || todayISO();
    document.getElementById('slipNote').value = slip.note || '';
    if (slip.photo) showPhoto(slip.photo); else clearPhoto();
    document.getElementById('slipDelete').hidden = false;
    goTo('slip');
}

function saveSlip(event) {
    event.preventDefault();
    const job = currentJob();
    if (!job) return false;

    const amountRaw = document.getElementById('slipAmount').value.replace(/[^0-9.,]/g, '').replace(',', '.');
    const amount = parseFloat(amountRaw);
    if (isNaN(amount) || amount <= 0) {
        toast('Please type the amount on the slip.');
        document.getElementById('slipAmount').focus();
        return false;
    }

    const iso = document.getElementById('slipDate').value;
    const data = {
        amount: Math.round(amount * 100) / 100,
        shop: document.getElementById('slipShop').value.trim(),
        category: document.getElementById('slipCategory').value,
        dateISO: iso,
        date: iso ? niceDate(iso) : todayNice(),
        note: document.getElementById('slipNote').value.trim(),
        photo: state.pendingPhoto || null
    };

    if (state.editingSlipId) {
        const slip = job.slips.find(s => s.id === state.editingSlipId);
        Object.assign(slip, data);
    } else {
        data.id = 's' + Date.now();
        job.slips.push(data);
    }
    save();
    goBack();          // back to job
    renderJob();
    toast('Saved');
    return false;
}

function deleteSlip() {
    const job = currentJob();
    if (!job || !state.editingSlipId) return;
    if (!confirm('Delete this till slip?')) return;
    job.slips = job.slips.filter(s => s.id !== state.editingSlipId);
    save();
    goBack();        // back to job
    renderJob();
    toast('Slip deleted');
}

// ---------- Photos (compressed so the phone doesn't fill up) ----------
function previewPhoto(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => compressImage(e.target.result, dataUrl => {
        state.pendingPhoto = dataUrl;
        showPhoto(dataUrl);
    });
    reader.readAsDataURL(file);
}

function compressImage(src, cb) {
    const img = new Image();
    img.onload = () => {
        const max = 1100;
        let { width, height } = img;
        if (width > max || height > max) {
            const scale = max / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        cb(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => cb(src);
    img.src = src;
}

function showPhoto(dataUrl) {
    document.getElementById('photoPreview').src = dataUrl;
    document.getElementById('photoPreviewWrap').hidden = false;
}

function clearPhoto() {
    state.pendingPhoto = null;
    document.getElementById('photoPreview').removeAttribute('src');
    document.getElementById('photoPreviewWrap').hidden = true;
    document.getElementById('slipPhoto').value = '';
}

// ---------- Export (CSV) + Share ----------
function buildCSV(job) {
    const rows = [['Date', 'Shop', 'Category', 'Note', 'Amount (R)']];
    [...job.slips].forEach(s => {
        rows.push([s.date || '', s.shop || '', s.category || '', s.note || '', (Number(s.amount) || 0).toFixed(2)]);
    });
    rows.push([]);
    rows.push(['', '', '', 'TOTAL', jobTotal(job).toFixed(2)]);
    return rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}

function csvCell(v) {
    v = String(v);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

async function exportJob() {
    const job = currentJob();
    if (!job) return;
    if (job.slips.length === 0) { toast('Add a slip first.'); return; }

    const csv = buildCSV(job);
    const filename = safeName(job.name) + '.csv';
    const file = new File([csv], filename, { type: 'text/csv' });

    // Best on iPhone: the native share sheet (email, WhatsApp, Files, etc.)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: job.name, text: 'Catering expenses: ' + job.name });
            return;
        } catch (e) {
            if (e && e.name === 'AbortError') return; // user cancelled
        }
    }
    // Fallback: download the file
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Spreadsheet ready');
}

function printJob() {
    const job = currentJob();
    if (!job) return;
    const win = window.open('', '_blank');
    if (!win) { window.print(); return; }
    const rows = [...job.slips].map(s =>
        '<tr><td>' + esc(s.date || '') + '</td><td>' + esc(s.shop || '') +
        '</td><td>' + esc(s.category) + '</td><td>' + esc(s.note || '') +
        '</td><td style="text-align:right">' + R(s.amount) + '</td></tr>'
    ).join('');
    win.document.write(
        '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(job.name) + '</title>' +
        '<style>body{font-family:-apple-system,Arial,sans-serif;margin:24px;color:#1f2421}' +
        'h1{margin:0 0 4px}.sub{color:#666;margin:0 0 18px}' +
        'table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;font-size:14px;text-align:left}' +
        'th{background:#eef3ef}tfoot td{font-weight:800;font-size:16px}</style></head><body>' +
        '<h1>' + esc(job.name) + '</h1><p class="sub">Catering expenses · ' + esc(job.date) + '</p>' +
        '<table><thead><tr><th>Date</th><th>Shop</th><th>For</th><th>Note</th><th style="text-align:right">Amount</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '<tfoot><tr><td colspan="4">TOTAL</td><td style="text-align:right">' + R(jobTotal(job)) + '</td></tr></tfoot>' +
        '</table></body></html>'
    );
    win.document.close();
    setTimeout(() => win.print(), 350);
}

// ---------- Backup / Restore (whole app) ----------
function backupData() {
    if (state.jobs.length === 0) { toast('Nothing to back up yet.'); return; }
    const data = JSON.stringify({ app: 'catering-till-slips', version: 1, jobs: state.jobs }, null, 2);
    const filename = 'till-slips-backup-' + todayISO() + '.json';
    const file = new File([data], filename, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'Till Slips backup' }).catch(() => {});
        return;
    }
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Backup saved');
}

function restoreData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const obj = JSON.parse(e.target.result);
                const jobs = Array.isArray(obj) ? obj : obj.jobs;
                if (!Array.isArray(jobs)) throw new Error('bad');
                if (!confirm('Restore ' + jobs.length + ' job(s)? This replaces what is on the phone now.')) return;
                state.jobs = jobs;
                save();
                renderHome();
                show('home');
                history = ['home'];
                toast('Backup restored');
            } catch (err) {
                toast('Sorry, that file could not be read.');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// ---------- Small helpers ----------
function esc(text) {
    const d = document.createElement('div');
    d.textContent = text == null ? '' : String(text);
    return d.innerHTML;
}
function safeName(name) {
    return (name || 'job').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'job';
}
function todayISO() { return new Date().toISOString().split('T')[0]; }
function niceDate(iso) {
    const p = iso.split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
}
function todayNice() { return niceDate(todayISO()); }

let toastTimer;
function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

// ---------- Start ----------
function init() {
    buildCategoryOptions();
    renderHome();
    show('home');

    // show the "Add to Home Screen" tip only on iPhone Safari, when not installed
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const installed = window.navigator.standalone === true;
    if (isIOS && !installed) document.getElementById('installTip').hidden = false;

    // register service worker for offline use (ignored if opened from a file)
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}
init();

// expose functions used by inline onclick handlers
Object.assign(window, {
    newJob, openJob, addSlip, editSlip, saveSlip, deleteSlip, deleteJob,
    updatePrice, previewPhoto, clearPhoto, exportJob, printJob,
    backupData, restoreData, goBack
});
