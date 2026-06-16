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
    resetOcrUI();
    showScanIntro();
    goTo('slip');
    // Scanning is the first thing — open the camera straight away.
    document.getElementById('slipPhoto').click();
}

// Show the "scan the slip" prompt; hide the details until there's a scan.
function showScanIntro() {
    document.getElementById('scanIntro').hidden = false;
    document.getElementById('slipFields').hidden = true;
}
function showFields() {
    document.getElementById('scanIntro').hidden = true;
    document.getElementById('slipFields').hidden = false;
}

// Rare fallback: let her type a slip in by hand.
function enterByHand() {
    showFields();
    resetOcrUI();
    setTimeout(() => document.getElementById('slipAmount').focus(), 100);
}

// Re-take the photo of the slip.
function rescan() {
    clearPhoto();
    document.getElementById('slipPhoto').click();
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
    resetOcrUI();
    showFields();        // editing an existing slip: show the details, no auto-scan
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
        showFields();        // reveal the details once we have a photo
        runOCR(dataUrl);     // read the slip and fill in the total automatically
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
    resetOcrUI();
}

// ============================================================
//  OCR — read the till slip and pull out the TOTAL
//  (runs entirely on the phone; no slip photo leaves the device)
// ============================================================

function resetOcrUI() {
    const status = document.getElementById('ocrStatus');
    if (status) status.hidden = true;
    const hint = document.getElementById('amountHint');
    if (hint) hint.hidden = true;
    const ch = document.getElementById('amountChoices');
    if (ch) { ch.hidden = true; ch.innerHTML = ''; }
}

// Load the OCR engine only the first time it is needed.
let tessLoader = null;
function ensureTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (tessLoader) return tessLoader;
    tessLoader = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        s.onload = resolve;
        s.onerror = () => reject(new Error('engine failed to load'));
        document.head.appendChild(s);
    });
    return tessLoader;
}

async function runOCR(dataUrl) {
    const status = document.getElementById('ocrStatus');
    status.hidden = false;
    status.className = 'ocr-status working';
    status.innerHTML = '<span class="spin"></span> Reading the slip… please wait';
    try {
        await ensureTesseract();
        const { data } = await Tesseract.recognize(dataUrl, 'eng', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    status.innerHTML = '<span class="spin"></span> Reading the slip… ' +
                        Math.round(m.progress * 100) + '%';
                }
            }
        });
        applyOCRResult(extractFromText(data.text || ''));
    } catch (e) {
        status.className = 'ocr-status warn';
        status.textContent = 'Could not read the slip automatically — please type the total in Step 2.';
    }
}

function applyOCRResult(result) {
    const status = document.getElementById('ocrStatus');
    if (result.total != null) {
        document.getElementById('slipAmount').value = result.total.toFixed(2);
        document.getElementById('amountHint').hidden = false;
        status.className = 'ocr-status ok';
        status.innerHTML = '✓ Read the total: <strong>' + R(result.total) +
            '</strong> — please check it is right.';
    } else {
        status.className = 'ocr-status warn';
        status.textContent = 'Could not find the total — please type it in Step 2.';
    }
    if (result.shop && !document.getElementById('slipShop').value) {
        document.getElementById('slipShop').value = result.shop;
    }
    if (result.dateISO) document.getElementById('slipDate').value = result.dateISO;
    renderAmountChoices(result.amounts);
}

// If the auto-pick is wrong, let her tap the correct amount from the slip.
function renderAmountChoices(amounts) {
    const wrap = document.getElementById('amountChoices');
    wrap.innerHTML = '';
    if (!amounts || amounts.length <= 1) { wrap.hidden = true; return; }
    const label = document.createElement('div');
    label.className = 'chips-label';
    label.textContent = 'Not right? Tap the correct total:';
    wrap.appendChild(label);
    amounts.forEach(v => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.textContent = R(v);
        b.addEventListener('click', () => {
            document.getElementById('slipAmount').value = v.toFixed(2);
            document.getElementById('amountHint').hidden = false;
            wrap.querySelectorAll('.chip').forEach(c => c.classList.remove('sel'));
            b.classList.add('sel');
        });
        wrap.appendChild(b);
    });
    wrap.hidden = false;
}

// Turn a messy bit of text like "R1 234,56" or "1,234.56" into a number.
function normalizeAmount(raw) {
    let s = String(raw).replace(/[^\d.,]/g, '');
    if (!s) return null;
    const hasComma = s.includes(','), hasDot = s.includes('.');
    if (hasComma && hasDot) {
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
        else s = s.replace(/,/g, '');
    } else if (hasComma) {
        if (/,\d{2}$/.test(s) && s.match(/,/g).length === 1) s = s.replace(',', '.');
        else s = s.replace(/,/g, '');
    } else if (hasDot) {
        if (!(/\.\d{2}$/.test(s) && s.match(/\./g).length === 1)) s = s.replace(/\./g, '');
    }
    const v = parseFloat(s);
    return isFinite(v) ? v : null;
}

// Pull the total (and shop / date / candidate amounts) out of the OCR text.
function extractFromText(text) {
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
    // English + Afrikaans words, since this is for a South African business.
    const TOTAL_KW = /(grand\s*total|total\s*due|amount\s*due|balance\s*due|to\s*pay|te\s*betaal|verskuldig|totaal|total|bedrag)/i;
    const STRONG_KW = /(grand\s*total|total\s*due|amount\s*due|balance\s*due|to\s*pay|te\s*betaal|verskuldig)/i;
    const NEG_KW = /(sub.?total|sub.?totaal|change|wisselgeld|tender|cash|kontant|round|afronding|\bvat\b|\bbtw\b|card|account|loyalty|points|saving)/i;

    const moneyIn = line => {
        const out = [];
        const re = /\d[\d .,]*\d|\d/g;
        let m;
        while ((m = re.exec(line))) {
            const v = normalizeAmount(m[0]);
            if (v != null && v > 0 && v < 1e7) out.push(v);
        }
        return out;
    };

    const allAmounts = [];
    const candidates = [];
    lines.forEach((line, i) => {
        const amts = moneyIn(line);
        amts.forEach(v => allAmounts.push(v));
        if (TOTAL_KW.test(line) && !NEG_KW.test(line)) {
            let pick = amts.length ? amts[amts.length - 1] : null;
            if (pick == null && i + 1 < lines.length) {
                const next = moneyIn(lines[i + 1]);
                if (next.length) pick = next[next.length - 1];
            }
            if (pick != null) candidates.push({ value: pick, priority: STRONG_KW.test(line) ? 2 : 1 });
        }
    });

    let total = null;
    if (candidates.length) {
        const maxP = Math.max(...candidates.map(c => c.priority));
        total = Math.max(...candidates.filter(c => c.priority === maxP).map(c => c.value));
    } else if (allAmounts.length) {
        total = Math.max(...allAmounts);   // the total is usually the biggest number
    }

    // shop name: first line near the top that is words, not numbers
    let shop = '';
    for (const line of lines) {
        const letters = line.replace(/[^a-z]/gi, '');
        if (letters.length >= 3 && !TOTAL_KW.test(line) && !/\d{2}[:/]\d{2}/.test(line)) {
            shop = titleCase(line.replace(/\s{2,}/g, ' ').slice(0, 40));
            break;
        }
    }

    // date: prefer 2026-06-16, else 16/06/2026 (day first, SA style)
    let dateISO = '';
    let dm = text.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (dm) {
        dateISO = dm[1] + '-' + pad(dm[2]) + '-' + pad(dm[3]);
    } else {
        dm = text.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
        if (dm) {
            let y = dm[3]; if (y.length === 2) y = '20' + y;
            dateISO = y + '-' + pad(dm[2]) + '-' + pad(dm[1]);
        }
    }
    if (dateISO && isNaN(Date.parse(dateISO))) dateISO = '';

    const amounts = [...new Set(allAmounts.map(v => Math.round(v * 100) / 100))]
        .sort((a, b) => b - a).slice(0, 8);

    return { total, amounts, shop, dateISO };
}

function pad(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
function titleCase(s) {
    return s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
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

// ---------- Install to home screen (Android Chrome) ----------
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();           // we'll show our own big button instead
    deferredInstall = e;
    document.getElementById('installBtn').hidden = false;
    document.getElementById('installTip').hidden = true;
});
function installApp() {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    deferredInstall.userChoice.finally(() => {
        deferredInstall = null;
        document.getElementById('installBtn').hidden = true;
    });
}
window.addEventListener('appinstalled', () => {
    document.getElementById('installBtn').hidden = true;
    document.getElementById('installTip').hidden = true;
    toast('Installed! Look for the icon on your home screen.');
});

// ---------- Start ----------
function init() {
    buildCategoryOptions();
    renderHome();
    show('home');

    // Help the user install to the home screen, on both Android and iPhone.
    const ua = navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isAndroid = /android/i.test(ua);
    const installed = window.navigator.standalone === true ||
        window.matchMedia('(display-mode: standalone)').matches;
    const tip = document.getElementById('installTip');
    if (!installed) {
        if (isIOS) {
            tip.innerHTML = 'Tip: tap the <strong>Share</strong> button in Safari and choose ' +
                '<strong>“Add to Home Screen”</strong> to use this like a normal app.';
            tip.hidden = false;
        } else if (isAndroid) {
            tip.innerHTML = 'Tip: tap the <strong>⋮</strong> menu in Chrome and choose ' +
                '<strong>“Install app”</strong> (or <strong>“Add to Home screen”</strong>) ' +
                'to use this like a normal app.';
            tip.hidden = false;
        }
    }

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
    backupData, restoreData, goBack, installApp,
    enterByHand, rescan
});
