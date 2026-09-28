/* ============================================
   UrukCode v4.0 — Clean JS Rewrite
   by Umaer Islam (umaerislam.com)
   ============================================ */

(function () {
    'use strict';

    // ─── State ───
    let qrCode = null;
    let logoDataUrl = null;
    let lastSnapshot = null;
    const hist = [];
    const HIST_MAX = 8;

    // ─── DOM ───
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    const qrPreview = $('#qr-preview');
    const bcPreview = $('#bc-preview');
    const bcSvg = $('#bc-svg');
    const typeGrid = $('#type-grid');
    const typeCells = $$('.type-cell');
    const qrType = $('#qr-type');
    const historyList = $('#history-list');

    const qrInputIds = ['qr-text', 'qr-email', 'qr-phone', 'qr-sms-phone', 'qr-sms-msg', 'qr-wifi-ssid', 'qr-wifi-pass', 'qr-wifi-enc', 'qr-wifi-hidden', 'qr-vc-name', 'qr-vc-phone', 'qr-vc-email', 'qr-vc-org', 'qr-vc-addr', 'qr-geo-lat', 'qr-geo-lon'];

    // ─── Helpers ───
    function escapeWifi(s) { return s.replace(/[\\;,"]/g, c => '\\' + c); }

    function toast(msg, type) {
        const icons = {
            ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            fail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
        };
        const el = $('#toast');
        el.className = 'toast ' + type;
        el.innerHTML = (icons[type] || '') + '<span>' + msg + '</span>';
        el.classList.add('show');
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove('show'), 2800);
    }

    function copyFlash() {
        const el = document.createElement('div');
        el.className = 'copy-flash';
        el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>';
        document.body.appendChild(el);
        el.addEventListener('animationend', () => el.remove());
    }

    // ─── Lazy CDN libs (pinned + SRI) ───
    const LIBS = {
        barcode: {
            src: 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js',
            integrity: 'sha384-Kk5SjBOKprEnGfyBWfD2zROFd1Cu8kwOXxG2GIhYPcoDL2rBJS9P8Ud1ZMy4412a'
        },
        jsqr: {
            src: 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
            integrity: 'sha384-hStSInNIZ8ljtOVrmrgf7zdHMapaLBWoSnPTtF0nzsybp4+LuhDz6sHuEVpWIX8o'
        }
    };
    const libPromises = {};
    let libErrorShown = false;

    function onLibError() {
        if (libErrorShown) return;
        libErrorShown = true;
        toast('Could not load library — check your connection', 'fail');
    }

    function loadLib(name) {
        if (libPromises[name]) return libPromises[name];
        libPromises[name] = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = LIBS[name].src;
            s.integrity = LIBS[name].integrity;
            s.crossOrigin = 'anonymous';
            s.onload = () => { libErrorShown = false; resolve(); };
            s.onerror = () => {
                delete libPromises[name];
                onLibError();
                reject(new Error('Failed to load ' + name));
            };
            document.head.appendChild(s);
        });
        return libPromises[name];
    }

    // ─── Theme ───
    function initTheme() {
        const saved = localStorage.getItem('theme');
        const system = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', saved || system);
    }
    function toggleTheme() {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    }
    $('#btn-theme').addEventListener('click', toggleTheme);
    initTheme();

    // ─── Custom Dropdowns ───
    const backdrop = $('#cs-backdrop');
    let openCs = null;
    let fixedList = null;
    let kbIndex = -1;

    function ensureFixedList() {
        if (fixedList) return fixedList;
        fixedList = document.createElement('div');
        fixedList.className = 'cs-fixed-list';
        fixedList.setAttribute('role', 'listbox');
        fixedList.setAttribute('tabindex', '-1');
        fixedList.addEventListener('keydown', onListKey);
        document.body.appendChild(fixedList);
        return fixedList;
    }

    function closeAllSelects() {
        if (openCs) {
            openCs.classList.remove('open');
            openCs.querySelector('.cs-trigger').setAttribute('aria-expanded', 'false');
        }
        if (fixedList) fixedList.classList.remove('cs-open');
        backdrop.classList.remove('active');
        openCs = null;
        kbIndex = -1;
    }

    function csOptions() {
        return fixedList ? Array.from(fixedList.querySelectorAll('.cs-option')) : [];
    }

    function setKb(index) {
        const opts = csOptions();
        if (!opts.length) return;
        kbIndex = ((index % opts.length) + opts.length) % opts.length;
        opts.forEach((o, i) => o.classList.toggle('cs-kb', i === kbIndex));
        opts[kbIndex].scrollIntoView({ block: 'nearest' });
    }

    function chooseOption(cs, value) {
        selectCsValue(cs, value);
        closeAllSelects();
        cs.querySelector('.cs-trigger').focus();
        cs.querySelector('select').dispatchEvent(new Event('change', { bubbles: true }));
    }

    function onListKey(e) {
        if (!openCs) return;
        const opts = csOptions();
        switch (e.key) {
            case 'ArrowDown': e.preventDefault(); setKb(kbIndex + 1); break;
            case 'ArrowUp': e.preventDefault(); setKb(kbIndex - 1); break;
            case 'Home': e.preventDefault(); setKb(0); break;
            case 'End': e.preventDefault(); setKb(opts.length - 1); break;
            case 'Enter': case ' ': {
                e.preventDefault();
                const opt = opts[kbIndex];
                if (opt) chooseOption(openCs, opt.dataset.value);
                break;
            }
            case 'Escape': e.preventDefault(); { const cs = openCs; closeAllSelects(); cs.querySelector('.cs-trigger').focus(); } break;
            case 'Tab': closeAllSelects(); break;
        }
    }

    function positionList(trigger) {
        const list = ensureFixedList();
        const rect = trigger.getBoundingClientRect();
        const gap = 6;
        const vh = window.innerHeight;
        const spaceBelow = vh - rect.bottom - gap;
        const spaceAbove = rect.top - gap;

        list.style.left = rect.left + 'px';
        list.style.width = rect.width + 'px';

        if (spaceBelow >= 200 || spaceBelow >= spaceAbove) {
            list.style.top = (rect.bottom + gap) + 'px';
            list.style.bottom = 'auto';
            list.classList.remove('cs-above');
        } else {
            list.style.bottom = (vh - rect.top + gap) + 'px';
            list.style.top = 'auto';
            list.classList.add('cs-above');
        }
    }

    function openCsDropdown(cs) {
        closeAllSelects();
        const trigger = cs.querySelector('.cs-trigger');
        const list = ensureFixedList();

        list.innerHTML = '';
        const options = cs.querySelectorAll('.cs-option');
        options.forEach(opt => {
            const clone = opt.cloneNode(true);
            clone.classList.add('cs-opt');
            clone.classList.toggle('cs-selected', opt.getAttribute('aria-selected') === 'true');
            clone.addEventListener('click', e => {
                e.stopPropagation();
                chooseOption(cs, clone.dataset.value);
            });
            list.appendChild(clone);
        });

        positionList(trigger);
        cs.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        list.classList.add('cs-open');
        backdrop.classList.add('active');
        openCs = cs;

        const opts = csOptions();
        const selIdx = opts.findIndex(o => o.classList.contains('cs-selected'));
        setKb(selIdx >= 0 ? selIdx : 0);
        list.focus({ preventScroll: true });
    }

    function selectCsValue(cs, value) {
        const native = cs.querySelector('select');
        const label = cs.querySelector('.cs-label');
        native.value = value;
        cs.querySelectorAll('.cs-option').forEach(o => {
            o.classList.toggle('selected', o.dataset.value === value);
            o.setAttribute('aria-selected', o.dataset.value === value);
        });
        const sel = cs.querySelector('.cs-option.selected');
        if (sel) {
            label.textContent = sel.textContent.trim();
            label.classList.remove('is-placeholder');
        }
    }

    function syncCsDropdown(id, value) {
        const cs = document.querySelector(`.custom-select[data-cs="${id}"]`);
        if (cs) selectCsValue(cs, value);
    }

    $$('.custom-select').forEach(cs => {
        const trigger = cs.querySelector('.cs-trigger');

        trigger.addEventListener('click', e => {
            e.stopPropagation();
            if (openCs === cs) { closeAllSelects(); return; }
            openCsDropdown(cs);
        });

        trigger.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                if (openCs === cs) { e.preventDefault(); closeAllSelects(); }
                return;
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (openCs !== cs) { openCsDropdown(cs); }
                else if (e.key === 'ArrowDown') setKb(kbIndex + 1);
                else if (e.key === 'ArrowUp') setKb(kbIndex - 1);
                else { const o = csOptions()[kbIndex]; if (o) chooseOption(cs, o.dataset.value); }
            }
        });
    });

    backdrop.addEventListener('click', closeAllSelects);
    document.addEventListener('click', e => {
        if (openCs && !e.target.closest('.custom-select') && !e.target.closest('.cs-fixed-list')) {
            closeAllSelects();
        }
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && openCs) {
            const cs = openCs;
            closeAllSelects();
            cs.querySelector('.cs-trigger').focus();
        }
    });
    window.addEventListener('scroll', () => { if (openCs) closeAllSelects(); }, true);
    window.addEventListener('resize', () => { if (openCs) closeAllSelects(); });

    // ─── Tabs ───
    const tabs = $$('.tab');
    const panels = $$('.panel');

    function switchMode(mode) {
        tabs.forEach(t => {
            const active = t.dataset.mode === mode;
            t.classList.toggle('active', active);
            t.setAttribute('aria-selected', active);
        });
        panels.forEach(p => p.classList.toggle('active', p.id === 'panel-' + mode));
        if (mode === 'qr') { qrPreview.style.display = ''; bcPreview.style.display = 'none'; genQR(); }
        else if (mode === 'barcode') { qrPreview.style.display = 'none'; bcPreview.style.display = ''; genBC(); }
        else { qrPreview.style.display = 'none'; bcPreview.style.display = 'none'; }
        const exportable = mode === 'qr' || mode === 'barcode';
        ['#btn-dl-png', '#btn-dl-svg', '#btn-copy'].forEach(id => {
            $(id).disabled = !exportable;
        });
        if (mode === 'barcode') loadLib('barcode').catch(() => {});
        else if (mode === 'decode') loadLib('jsqr').catch(() => {});
    }

    tabs.forEach(t => t.addEventListener('click', () => switchMode(t.dataset.mode)));

    // ─── Accordion ───
    $$('.card-head').forEach(head => {
        head.addEventListener('click', () => {
            const card = head.closest('.card');
            card.classList.toggle('open');
            head.setAttribute('aria-expanded', card.classList.contains('open'));
        });
    });

    // ─── QR Type Grid ───
    function syncTypeGrid(type) {
        typeCells.forEach(c => c.classList.toggle('active', c.dataset.type === type));
        qrType.value = type;
        syncCsDropdown('qr-type', type);
    }

    typeCells.forEach(c => c.addEventListener('click', () => {
        syncTypeGrid(c.dataset.type);
        updateFields();
        genQR();
    }));

    qrType.addEventListener('change', () => {
        syncTypeGrid(qrType.value);
        updateFields();
        genQR();
    });

    function updateFields() {
        const t = qrType.value;
        $$('#qr-fields .field-col').forEach(f => {
            const types = (f.dataset.type || '').split(',');
            f.classList.toggle('hidden', !types.includes(t));
        });
    }

    // ─── QR Content ───
    function captureSnapshot(type) {
        const fields = {};
        qrInputIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            fields[id] = el.type === 'checkbox' ? el.checked : el.value;
        });
        return { type, fields };
    }

    function getQRData() {
        const t = qrType.value;
        lastSnapshot = captureSnapshot(t);
        switch (t) {
            case 'text': case 'url': return $('#qr-text').value.trim();
            case 'email': { const v = ($('#qr-email')?.value || '').trim(); return v ? 'mailto:' + v : ''; }
            case 'phone': { const v = ($('#qr-phone')?.value || '').trim(); return v ? 'tel:' + v : ''; }
            case 'sms': {
                const p = ($('#qr-sms-phone')?.value || '').trim();
                if (!p) return '';
                const m = $('#qr-sms-msg')?.value;
                return m ? 'smsto:' + p + ':' + m : 'sms:' + p;
            }
            case 'wifi': {
                const ssid = ($('#qr-wifi-ssid')?.value || '').trim();
                if (!ssid) return '';
                const pass = $('#qr-wifi-pass')?.value || '';
                const enc = $('#qr-wifi-enc')?.value || 'WPA';
                const hid = $('#qr-wifi-hidden')?.checked;
                let s = 'WIFI:T:' + enc + ';S:' + escapeWifi(ssid);
                if (pass) s += ';P:' + escapeWifi(pass);
                if (hid) s += ';H:true';
                return s + ';;';
            }
            case 'vcard': {
                const n = ($('#qr-vc-name')?.value || '').trim();
                const p = ($('#qr-vc-phone')?.value || '').trim();
                const e = ($('#qr-vc-email')?.value || '').trim();
                const o = ($('#qr-vc-org')?.value || '').trim();
                const a = ($('#qr-vc-addr')?.value || '').trim();
                if (!n && !p && !e && !o && !a) return '';
                let v = 'BEGIN:VCARD\nVERSION:3.0\nFN:' + n + '\nN:' + n + ';;;;';
                if (p) v += '\nTEL:' + p;
                if (e) v += '\nEMAIL:' + e;
                if (o) v += '\nORG:' + o;
                if (a) v += '\nADR:;;' + a + ';;;;';
                return v + '\nEND:VCARD';
            }
            case 'geo': {
                const lat = ($('#qr-geo-lat')?.value || '').trim();
                const lon = ($('#qr-geo-lon')?.value || '').trim();
                if (!lat && !lon) return '';
                return 'geo:' + (lat || '0') + ',' + (lon || '0');
            }
            default: return $('#qr-text')?.value.trim() || '';
        }
    }

    function showEmpty() {
        qrPreview.innerHTML = '<div class="preview-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg><span>Enter content to generate</span></div>';
    }

    // ─── QR Generation ───
    function getQROpts() {
        return {
            width: +$('#qr-size').value,
            height: +$('#qr-size').value,
            data: getQRData(),
            margin: 10,
            qrOptions: { typeNumber: 0, mode: 'Byte', errorCorrectionLevel: $('#qr-ecl').value },
            imageOptions: { hideBackgroundDots: true, imageSize: 0.4, margin: 5 },
            dotsOptions: { color: $('#qr-fg').value, type: $('#qr-dots').value },
            cornersSquareOptions: { color: $('#qr-fg').value, type: $('#qr-corners').value },
            backgroundOptions: { color: $('#qr-bg').value },
            image: ($('#qr-logo-on').checked && logoDataUrl) ? logoDataUrl : undefined
        };
    }

    function genQR() {
        const data = getQRData();
        if (!data) { qrCode = null; showEmpty(); return; }
        if (typeof QRCodeStyling === 'undefined') { qrPreview.innerHTML = '<div class="preview-empty"><span>Loading...</span></div>'; return; }
        if (!qrCode) {
            qrCode = new QRCodeStyling(getQROpts());
            qrPreview.innerHTML = '';
            qrCode.append(qrPreview);
        } else {
            qrPreview.innerHTML = '';
            qrCode.update(getQROpts());
            qrCode.append(qrPreview);
        }
        addHistory();
    }

    // ─── History ───
    function addHistory() {
        if (!qrCode) return;
        qrCode.getRawData('png').then(blob => {
            const url = URL.createObjectURL(blob);
            const data = getQRData();
            if (!data) { URL.revokeObjectURL(url); return; }
            const idx = hist.findIndex(h => h.data === data);
            if (idx >= 0) URL.revokeObjectURL(hist[idx].url);
            if (idx >= 0) hist.splice(idx, 1);
            hist.unshift({ url, data, blob, snapshot: lastSnapshot });
            if (hist.length > HIST_MAX) { const old = hist.pop(); URL.revokeObjectURL(old.url); }
            renderHistory();
        });
    }

    function applySnapshot(snap) {
        if (!snap || !snap.type) {
            $('#qr-text').value = '';
            syncTypeGrid(detectType(''));
            updateFields();
            genQR();
            return;
        }
        syncTypeGrid(snap.type);
        qrInputIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el || !(id in snap.fields)) return;
            if (el.type === 'checkbox') el.checked = snap.fields[id];
            else el.value = snap.fields[id];
        });
        syncCsDropdown('qr-wifi-enc', document.getElementById('qr-wifi-enc').value);
        updateFields();
        genQR();
    }

    function renderHistory() {
        historyList.innerHTML = '';
        hist.forEach(h => {
            const d = document.createElement('div');
            d.className = 'history-chip';
            d.title = h.data.substring(0, 50);
            const img = document.createElement('img');
            img.src = h.url;
            img.loading = 'lazy';
            d.appendChild(img);
            d.addEventListener('click', () => applySnapshot(h.snapshot));
            historyList.appendChild(d);
        });
    }

    function clearHistory() {
        hist.forEach(h => URL.revokeObjectURL(h.url));
        hist.length = 0;
        historyList.innerHTML = '';
    }

    function detectType(s) {
        if (/^https?:\/\//i.test(s)) return 'url';
        if (/^mailto:/i.test(s)) return 'email';
        if (/^tel:/i.test(s)) return 'phone';
        if (/^geo:/i.test(s)) return 'geo';
        if (/^WIFI:/i.test(s)) return 'wifi';
        if (/^BEGIN:VCARD/i.test(s)) return 'vcard';
        return 'text';
    }

    // ─── Download & Copy ───
    function dlQR(fmt) { if (qrCode) { qrCode.download({ name: 'urukcode-qr', extension: fmt }); toast('Downloaded as ' + fmt.toUpperCase(), 'ok'); } }
    function cpQR() { if (qrCode) qrCode.getRawData('png').then(b => { navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(() => { copyFlash(); toast('Copied', 'ok'); }); }); }

    function dlBC(fmt) {
        if (!bcSvg.innerHTML.trim()) { toast('Nothing to download', 'fail'); return; }
        const svg = bcSvg.cloneNode(true);
        const data = new XMLSerializer().serializeToString(svg);
        if (fmt === 'svg') {
            const blob = new Blob([data], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'urukcode-barcode.svg'; a.click();
            URL.revokeObjectURL(url);
        } else {
            const c = document.createElement('canvas');
            const ctx = c.getContext('2d');
            const img = new Image();
            img.onload = () => { c.width = img.width; c.height = img.height; ctx.fillStyle = $('#bc-bg').value; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0); const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'urukcode-barcode.png'; a.click(); };
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)));
        }
        toast('Downloaded as ' + fmt.toUpperCase(), 'ok');
    }
    function cpBC() {
        if (!bcSvg.innerHTML.trim()) { toast('Nothing to copy', 'fail'); return; }
        const svg = bcSvg.cloneNode(true);
        const data = new XMLSerializer().serializeToString(svg);
        const c = document.createElement('canvas');
        const ctx = c.getContext('2d');
        const img = new Image();
        img.onload = () => { c.width = img.width; c.height = img.height; ctx.fillStyle = $('#bc-bg').value; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0); c.toBlob(b => { navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(() => { copyFlash(); toast('Copied', 'ok'); }); }); };
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)));
    }

    $('#btn-dl-png').addEventListener('click', () => { if ($('#panel-qr').classList.contains('active')) dlQR('png'); else dlBC('png'); });
    $('#btn-dl-svg').addEventListener('click', () => { if ($('#panel-qr').classList.contains('active')) dlQR('svg'); else dlBC('svg'); });
    $('#btn-copy').addEventListener('click', () => { if ($('#panel-qr').classList.contains('active')) cpQR(); else cpBC(); });

    // ─── Barcode ───
    function genBC() {
        const data = $('#bc-data').value.trim();
        if (!data) { bcSvg.innerHTML = ''; return; }
        if (typeof JsBarcode === 'undefined') {
            bcSvg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#9898aa" font-size="14">Loading…</text>';
            loadLib('barcode').then(genBC, () => {
                bcSvg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#ef4444" font-size="14">Library failed to load</text>';
            });
            return;
        }
        try {
            JsBarcode(bcSvg, data, {
                format: $('#bc-format').value,
                width: +$('#bc-width').value,
                height: +$('#bc-height').value,
                displayValue: $('#bc-show-text').checked,
                margin: +$('#bc-margin').value,
                lineColor: $('#bc-fg').value,
                background: $('#bc-bg').value,
                fontOptions: 'bold', fontSize: 14
            });
        } catch (e) {
            bcSvg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#ef4444" font-size="14">Invalid data</text>';
        }
    }

    let bcTimer;
    $('#bc-data').addEventListener('input', () => { clearTimeout(bcTimer); bcTimer = setTimeout(genBC, 300); });
    $('#bc-format').addEventListener('change', genBC);
    $('#bc-show-text').addEventListener('change', genBC);

    ['bc-width', 'bc-height', 'bc-margin'].forEach(id => {
        const el = $('#' + id);
        el.addEventListener('input', () => { $('#' + id + '-val').textContent = el.value; genBC(); });
    });

    // ─── Color Sync ───
    function syncColor(prefix, input, hex) {
        input.addEventListener('input', () => { hex.value = input.value; if (prefix === 'qr') genQR(); else genBC(); });
        hex.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) { input.value = hex.value; if (prefix === 'qr') genQR(); else genBC(); } });
    }
    syncColor('qr', $('#qr-fg'), $('#qr-fg-hex'));
    syncColor('qr', $('#qr-bg'), $('#qr-bg-hex'));
    syncColor('bc', $('#bc-fg'), $('#bc-fg-hex'));
    syncColor('bc', $('#bc-bg'), $('#bc-bg-hex'));

    // ─── QR Presets ───
    $$('.preset:not(.bc-preset)').forEach(b => b.addEventListener('click', () => {
        $('#qr-fg').value = b.dataset.fg; $('#qr-fg-hex').value = b.dataset.fg;
        $('#qr-bg').value = b.dataset.bg; $('#qr-bg-hex').value = b.dataset.bg;
        genQR();
    }));

    // ─── BC Presets ───
    $$('.bc-preset').forEach(b => b.addEventListener('click', () => {
        $('#bc-fg').value = b.dataset.fg; $('#bc-fg-hex').value = b.dataset.fg;
        $('#bc-bg').value = b.dataset.bg; $('#bc-bg-hex').value = b.dataset.bg;
        genBC();
    }));

    // ─── QR Options ───
    ['qr-dots', 'qr-corners', 'qr-ecl'].forEach(id => $('#' + id).addEventListener('change', genQR));
    const sizeSlider = $('#qr-size');
    sizeSlider.addEventListener('input', () => { $('#qr-size-val').textContent = sizeSlider.value; genQR(); });

    // ─── Logo ───
    $('#qr-logo').addEventListener('change', e => {
        const f = e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = ev => { logoDataUrl = ev.target.result; $('#qr-logo-on').checked = true; $('#qr-logo-rm').classList.remove('hidden'); genQR(); };
        r.readAsDataURL(f);
    });
    $('#qr-logo-on').addEventListener('change', genQR);
    $('#qr-logo-rm').addEventListener('click', () => { logoDataUrl = null; $('#qr-logo-on').checked = false; $('#qr-logo').value = ''; $('#qr-logo-rm').classList.add('hidden'); genQR(); });

    // ─── QR Text Inputs ───
    let qrTimer;
    qrInputIds.forEach(id => {
        const el = $('#' + id);
        if (el) el.addEventListener('input', () => { clearTimeout(qrTimer); qrTimer = setTimeout(genQR, 300); });
    });

    // ─── Decode ───
    const DECODE_MAX = 1600;

    function showDecodeError() {
        $('#dec-result').classList.add('hidden');
        $('#dec-error').classList.remove('hidden');
    }

    function decodeImg(file) {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(1, DECODE_MAX / Math.max(img.width, img.height));
                const c = document.createElement('canvas');
                c.width = Math.max(1, Math.round(img.width * scale));
                c.height = Math.max(1, Math.round(img.height * scale));
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0, c.width, c.height);
                const data = ctx.getImageData(0, 0, c.width, c.height);
                if (typeof jsQR === 'undefined') {
                    loadLib('jsqr').then(() => decodeImg(file), showDecodeError);
                    return;
                }
                const code = jsQR(data.data, data.width, data.height);
                if (code) {
                    $('#dec-content').textContent = code.data;
                    $('#dec-content').dataset.val = code.data;
                    $('#dec-result').classList.remove('hidden');
                    $('#dec-error').classList.add('hidden');
                } else {
                    showDecodeError();
                }
            };
            img.onerror = showDecodeError;
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    $('#dec-input').addEventListener('change', e => { if (e.target.files[0]) decodeImg(e.target.files[0]); });
    $('#dec-copy').addEventListener('click', () => {
        const v = $('#dec-content').dataset.val || $('#dec-content').textContent;
        if (v) navigator.clipboard.writeText(v).then(() => { copyFlash(); toast('Copied', 'ok'); });
    });

    const drop = $('#dec-drop');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', e => {
        e.preventDefault(); drop.classList.remove('dragover');
        const f = e.dataTransfer.files[0];
        if (f && f.type.startsWith('image/')) { $('#dec-input').files = e.dataTransfer.files; decodeImg(f); }
    });

    // ─── Modal ───
    const modal = $('#modal');
    $('#btn-keys').addEventListener('click', () => { modal.classList.remove('hidden'); document.body.style.overflow = 'hidden'; });
    $('#modal-x').addEventListener('click', closeModal);
    modal.querySelector('.modal-bg').addEventListener('click', closeModal);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal(); });
    function closeModal() { modal.classList.add('hidden'); document.body.style.overflow = ''; }

    // ─── Keyboard Shortcuts ───
    document.addEventListener('keydown', e => {
        if (e.ctrlKey || e.metaKey) {
            const key = e.key.toLowerCase();
            if (key === '1') { e.preventDefault(); switchMode('qr'); }
            else if (key === '2') { e.preventDefault(); switchMode('barcode'); }
            else if (key === '3') { e.preventDefault(); switchMode('decode'); }
            else if (key === 'r' && e.shiftKey) { e.preventDefault(); $('#btn-reset').click(); }
            else if (key === 's') { e.preventDefault(); $('#btn-dl-png').click(); }
        }
    });

    // ─── Reset ───
    $('#btn-reset').addEventListener('click', () => {
        qrInputIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (el.type === 'checkbox') el.checked = false;
            else if (el.tagName !== 'SELECT') el.value = '';
        });
        syncTypeGrid('text');
        updateFields();
        syncCsDropdown('qr-wifi-enc', 'WPA');
        $('#qr-fg').value = '#a855f7'; $('#qr-fg-hex').value = '#a855f7';
        $('#qr-bg').value = '#ffffff'; $('#qr-bg-hex').value = '#ffffff';
        syncCsDropdown('qr-dots', 'square');
        syncCsDropdown('qr-corners', 'square');
        syncCsDropdown('qr-ecl', 'M');
        sizeSlider.value = 256; $('#qr-size-val').textContent = '256';
        logoDataUrl = null; $('#qr-logo').value = '';
        $('#qr-logo-on').checked = false; $('#qr-logo-rm').classList.add('hidden');
        $('#bc-data').value = ''; syncCsDropdown('bc-format', 'CODE128');
        $('#bc-fg').value = '#a855f7'; $('#bc-fg-hex').value = '#a855f7';
        $('#bc-bg').value = '#ffffff'; $('#bc-bg-hex').value = '#ffffff';
        $('#bc-show-text').checked = true;
        [['bc-width', '2'], ['bc-height', '80'], ['bc-margin', '10']].forEach(([id, val]) => {
            $('#' + id).value = val;
            $('#' + id + '-val').textContent = val;
        });
        $('#dec-input').value = '';
        $('#dec-content').textContent = '';
        delete $('#dec-content').dataset.val;
        $('#dec-result').classList.add('hidden');
        $('#dec-error').classList.add('hidden');
        clearHistory();
        genQR(); genBC();
        toast('Reset to defaults', 'ok');
    });

    // ─── Init ───
    updateFields();
    $('#qr-text').value = 'https://example.com';
    setTimeout(genQR, 200);

})();
