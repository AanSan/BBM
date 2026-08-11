/**
 * ==============================================================
 * APP.JS — Sistem Manajemen & Rekonsiliasi Kupon BBM KPPD DIY di Kab. Bantul
 * v3 ENHANCED: Stock Opname, Manual LPJ Voucher Override, WA Reminder, Modern BA
 * ==============================================================
 */

const BBM_TYPES = [
    { name: "PERTAMAX 20.000", label: "🟢 PERTAMAX Rp20.000 (Motor)", nominalKupon: 20000 },
    { name: "PERTAMAX 100.000", label: "🔵 PERTAMAX Rp100.000 (Mobil)", nominalKupon: 100000 },
    { name: "PERTAMAX 200.000", label: "🔵 PERTAMAX Rp200.000 (Mobil)", nominalKupon: 200000 },
    { name: "DEXLITE 200.000", label: "🟠 DEXLITE Rp200.000 (Bus/Genzet)", nominalKupon: 200000 }
];

const KENDARAAN_RULES = [
    { plat: "AVANZA 86 B", label: "🚘 Avanza AB 86 B", keywords: ["86 B", "86B", "AVANZA 86"], bbm: "PERTAMAX 200.000" },
    { plat: "JEMPOL 1132 BI", label: "🚙 Jempol AB 1132 BI", keywords: ["1132", "JEMPOL"], bbm: "PERTAMAX 100.000" },
    { plat: "PICK UP 8243 UA", label: "🛻 Pick Up AB 8243 UA", keywords: ["8243", "PICK UP", "PICKUP"], bbm: "PERTAMAX 200.000" },
    { plat: "SAMLING 7110 UA", label: "🚐 Samling AB 7110 UA", keywords: ["7110", "SAMLING"], bbm: "DEXLITE 200.000" },
    { plat: "L300 AB8073BI", label: "🚐 L300 AB 8073 BI", keywords: ["8073", "L300", "AB8073BI"], bbm: "DEXLITE 200.000" },
    { plat: "AVANZA 1000 IS", label: "🚘 Avanza AB 1000 IS", keywords: ["1000 IS", "1000IS", "1000"], bbm: "PERTAMAX 200.000" },
    { plat: "SUPRA 2112 IA", label: "🛵 Supra AB 2112 IA", keywords: ["2112 IA", "2112IA"], bbm: "PERTAMAX 20.000" },
    { plat: "SUPRA 2112 UB", label: "🛵 Supra AB 2112 UB", keywords: ["2112 UB", "2112UB"], bbm: "PERTAMAX 20.000" },
    { plat: "SUPRA 2859 IS", label: "🛵 Supra AB 2859 IS", keywords: ["2859", "SUPRA 2859"], bbm: "PERTAMAX 20.000" },
    { plat: "GODOOR 2422 IF", label: "🛵 Godoor AB 2422 IF", keywords: ["2422", "GODOOR"], bbm: "PERTAMAX 20.000" },
    { plat: "GENZET", label: "⚡ Genset", keywords: ["GENZET", "GENSET"], bbm: "DEXLITE 200.000" }
];

const SPREADSHEET_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbysIPrgfB334TAe076cy1zBlHbsZUzb6WT4ZsfoqXbbcK1idGe8k5Z5decnSuRKjMFC/exec";

// App Local Database States
let databaseNota = [];
let databaseIntransit = [];
let databaseSaldoAwal = [];
let databasePembelian = [];
let databaseOpname = [];
let tempCurrentBase64 = "";

let pendingDeleteAction = null;

// === HELPER: Local date string (fix timezone bug dengan toISOString yang return UTC) ===
function getLocalDateYMD(date) {
    var d = date || new Date();
    var year = d.getFullYear();
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
}

// ============================================================
// AUTH SESSION MANAGEMENT
// ============================================================
function getAuthToken() {
    return sessionStorage.getItem('bbm_auth_token') || '';
}

function setAuthToken(token) {
    sessionStorage.setItem('bbm_auth_token', token);
}

function clearAuthToken() {
    sessionStorage.removeItem('bbm_auth_token');
}

function isLoggedIn() {
    return !!getAuthToken();
}

function showLoginScreen() {
    const login = document.getElementById('loginScreen');
    const main = document.getElementById('mainContainer');
    if (login) login.style.display = 'flex';
    if (main) main.style.display = 'none';
}

function showMainApp() {
    const login = document.getElementById('loginScreen');
    const main = document.getElementById('mainContainer');
    if (login) login.style.display = 'none';
    if (main) main.style.display = '';
}

function handleAuthError() {
    clearAuthToken();
    showLoginScreen();
    showToast('\u26a0\ufe0f Sesi habis, silakan login kembali.', 'warning');
}

function handleLogout() {
    clearAuthToken();
    showLoginScreen();
    showToast('\ud83d\udeaa Anda telah keluar dari sistem.', 'info');
}

// ============================================================
// PWA & WEB NOTIFICATION SYSTEM HELPER
// ============================================================
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => {
                    console.log('[PWA] Service Worker terdaftar:', reg.scope);
                })
                .catch(err => {
                    console.warn('[PWA] Service Worker gagal:', err);
                });
        });
    }
}

function periksaStatusNotifikasi() {
    const btnText = document.getElementById('notifStatusText');
    const btn = document.getElementById('btnEnableNotif');
    if (!('Notification' in window)) {
        if (btnText) btnText.textContent = 'Tanpa Notif';
        if (btn) btn.style.display = 'none';
        return;
    }
    if (Notification.permission === 'granted') {
        if (btnText) btnText.textContent = 'Notif Aktif';
        if (btn) {
            btn.classList.remove('warning');
            btn.classList.add('success');
        }
    } else if (Notification.permission === 'denied') {
        if (btnText) btnText.textContent = 'Notif Ditolak';
    } else {
        if (btnText) btnText.textContent = 'Notif HP';
    }
}

function mintaIzinNotifikasi() {
    if (!('Notification' in window)) {
        showToast("⚠️ Browser Anda tidak mendukung Web Notification.", "warning");
        return;
    }
    if (Notification.permission === 'granted') {
        showToast("✅ Notifikasi sistem sudah aktif di HP Anda.", "info");
        kirimNotifikasiSistem("🏛️ Notifikasi BBM KPPD Bantul", "Notifikasi sistem logistik aktif di HP Anda.");
        return;
    }
    Notification.requestPermission().then(permission => {
        periksaStatusNotifikasi();
        if (permission === 'granted') {
            showToast("✅ Izin Notifikasi diberikan!", "success");
            kirimNotifikasiSistem("🏛️ Notifikasi BBM KPPD Bantul", "Selamat! Notifikasi sistem logistik aktif di HP Anda.");
        } else {
            showToast("⚠️ Izin notifikasi ditolak oleh pengguna.", "warning");
        }
    });
}

function kirimNotifikasiSistem(title, body, tag = 'bbm-general') {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
        return;
    }
    const options = {
        body: body,
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%230f172a'/><text y='.9em' x='10' font-size='80'>🏛️</text></svg>",
        badge: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%230f172a'/><text y='.9em' x='10' font-size='80'>🏛️</text></svg>",
        tag: tag,
        renotify: true
    };

    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(title, options);
        });
    } else {
        new Notification(title, options);
    }
}

function togglePasswordVisibility() {
    const input = document.getElementById('loginPassword');
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
    } else {
        input.type = 'password';
    }
}

function fetchWithAuth(payload) {
    payload.token = getAuthToken();
    return fetch(SPREADSHEET_WEBAPP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data && data.status === 'auth_error') {
            handleAuthError();
            return null;
        }
        return data;
    })
    .catch(err => {
        console.error('Request error:', err);
        return null;
    });
}

const BADGE_CLASS_MAP = {
    'PERTAMAX 20.000': 'badge-pertalite',
    'PERTAMAX 100.000': 'badge-pertamax',
    'PERTAMAX 100.000 (SPBU PIRAMID)': 'badge-pertamax',
    'PERTAMAX 200.000': 'badge-pertamax',
    'DEXLITE 200.000': 'badge-dexlite',
    'PERTAMINA DEX 200.000': 'badge-dexlite'
};

function cleanBbmDisplay(name) {
    if (!name) return '';
    let str = String(name).replace(/\s*\(SPBU\s+PIRAMID\)/gi, '').trim();
    if (str.toUpperCase().includes('PERTAMINA DEX') || str.toUpperCase().includes('DEXLITE')) {
        return 'DEXLITE 200.000';
    }
    return str;
}

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatTanggalIndo(str) {
    if (!str) return '-';
    var cleanStr = String(str).trim().split('T')[0];
    var parts = cleanStr.split(/[-/]/);
    if (parts.length === 3) {
        if (parts[0].length === 4) {
            return parts[2].padStart(2, '0') + '/' + parts[1].padStart(2, '0') + '/' + parts[0];
        }
        if (parts[2].length === 4) {
            return parts[0].padStart(2, '0') + '/' + parts[1].padStart(2, '0') + '/' + parts[2];
        }
    }
    return cleanStr;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';
    if (type === 'warning') icon = '🔔';

    toast.innerHTML = `<span>${icon}</span> <span>${escapeHTML(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function populateVehicleAndBbmDropdowns() {
    const platSelects = [
        document.getElementById('platNomor'),
        document.getElementById('platPemohon'),
        document.getElementById('editPlatNomor')
    ];
    const bbmSelects = [
        document.getElementById('jenisBbm'),
        document.getElementById('bbmPemohon'),
        document.getElementById('pembelianBbm'),
        document.getElementById('filterBbm'),
        document.getElementById('editJenisBbm')
    ];

    platSelects.forEach(select => {
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = '<option value="">🚗 -- Pilih Kendaraan Ops KPPD --</option>';
        KENDARAAN_RULES.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.plat;
            opt.textContent = item.label || item.plat;
            select.appendChild(opt);
        });
        if (currentVal) select.value = currentVal;
    });

    bbmSelects.forEach(select => {
        if (!select) return;
        const currentVal = select.value;
        if (select.id === 'filterBbm') {
            select.innerHTML = '<option value="">🔍 Semua Jenis BBM</option>';
        } else {
            select.innerHTML = '<option value="">⛽ -- Pilih Jenis BBM / Voucher --</option>';
        }
        BBM_TYPES.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.name;
            opt.textContent = item.label || item.name;
            select.appendChild(opt);
        });
        if (currentVal) select.value = currentVal;
    });

    applyCustomSelectToAll();
}

function getNominalPerKupon(namaBbm) {
    if (!namaBbm) return 20000;
    var str = String(namaBbm).toUpperCase();
    if (str.includes("100.000")) return 100000;
    if (str.includes("200.000")) return 200000;
    if (str.includes("20.000")) return 20000;
    if (str.includes("DEXLITE") || str.includes("DEX")) return 200000;
    return 20000;
}

function matchBbmKey(namaBbm) {
    if (!namaBbm) return "PERTAMAX 20.000";
    const upper = String(namaBbm).toUpperCase().trim();
    if (upper.includes("DEX") || upper.includes("DEXLITE")) return "DEXLITE 200.000";
    if (upper.includes("100.000") || upper.includes("100000")) return "PERTAMAX 100.000";
    if (upper.includes("200.000") || upper.includes("200000")) return "PERTAMAX 200.000";
    if (upper.includes("20.000") || upper.includes("20000")) return "PERTAMAX 20.000";
    const exact = BBM_TYPES.find(t => t.name.toUpperCase() === upper);
    if (exact) return exact.name;
    const partial = BBM_TYPES.find(t => upper.includes(t.name.toUpperCase()) || t.name.toUpperCase().includes(upper));
    if (partial) return partial.name;
    return "PERTAMAX 20.000";
}

// ============================================================
// HITUNG STOK PER JENIS BBM (TERMASUK OPNAME ADJUSTMENT)
// ============================================================
function hitungStokPerJenis() {
    const stokMap = {};

    BBM_TYPES.forEach(t => {
        stokMap[t.name] = { kupon: 0, rp: 0, nominal: t.nominalKupon };
    });

    // 1. Saldo Awal
    if (databaseSaldoAwal && Array.isArray(databaseSaldoAwal)) {
        databaseSaldoAwal.forEach(item => {
            const key = matchBbmKey(item.barang);
            if (key && stokMap[key]) {
                stokMap[key].kupon += Number(item.kupon) || 0;
                stokMap[key].rp += Number(item.jumlah) || 0;
            }
        });
    }

    // 2. Pembelian / Pasokan
    if (databasePembelian && Array.isArray(databasePembelian)) {
        databasePembelian.forEach(item => {
            const key = matchBbmKey(item.barang);
            if (key && stokMap[key]) {
                const jml = Number(item.kupon) || 0;
                stokMap[key].kupon += jml;
                stokMap[key].rp += jml * stokMap[key].nominal;
            }
        });
    }

    // 3. Nota Terpakai LPJ
    databaseNota.forEach(item => {
        const key = matchBbmKey(item.bbm);
        if (key && stokMap[key]) {
            let jml = Number(item.kupon);
            if (!jml || isNaN(jml)) {
                const nominal = Number(item.total) || 0;
                jml = Math.floor(nominal / stokMap[key].nominal) || 1;
            }
            stokMap[key].kupon -= jml;
            stokMap[key].rp -= jml * stokMap[key].nominal;
        }
    });

    // 4. Intransit (PENDING)
    databaseIntransit.forEach(item => {
        if (item.status === "PENDING" || !item.status) {
            const key = matchBbmKey(item.bbm);
            if (key && stokMap[key]) {
                const jml = Number(item.kupon) || 0;
                stokMap[key].kupon -= jml;
                stokMap[key].rp -= jml * stokMap[key].nominal;
            }
        }
    });

    // 5. Penyesuaian Selisih Opname Terakhir (jika ada)
    if (databaseOpname && databaseOpname.length > 0) {
        databaseOpname.forEach(op => {
            const key = matchBbmKey(op.bbm);
            if (key && stokMap[key]) {
                const selisih = Number(op.selisih) || 0;
                stokMap[key].kupon += selisih;
                stokMap[key].rp += selisih * stokMap[key].nominal;
            }
        });
    }

    return stokMap;
}

function muatDataDariSpreadsheet() {
    if (!SPREADSHEET_WEBAPP_URL) return;

    const fetchUrl = SPREADSHEET_WEBAPP_URL + "?nocache=" + new Date().getTime() + "&token=" + encodeURIComponent(getAuthToken());

    fetch(fetchUrl)
        .then(async res => {
            if (!res.ok) throw new Error("HTTP Error " + res.status);
            return res.json();
        })
        .then(data => {
            if (data && data.status === 'auth_error') {
                handleAuthError();
                return;
            }
            if (data) {
                databaseNota = data.nota || [];
                databaseIntransit = data.intransit || [];
                databaseSaldoAwal = data.saldoAwal || [];
                databasePembelian = data.pembelian || [];
                databaseOpname = data.opname || [];
            }
            populateDropdownIntransit();
            renderTabel();
            renderTabelIntransit();
            renderTabelPembelian();
            renderTabelOpname();
            renderOpnameFormInputs();
            hitungDanRenderSummary();
        })
        .catch(err => {
            console.error("Gagal sinkronisasi cloud:", err);
            renderTabel();
            renderTabelIntransit();
            renderTabelPembelian();
            renderTabelOpname();
            renderOpnameFormInputs();
            hitungDanRenderSummary();
        });
}

function switchTab(tabId) {
    document.querySelectorAll('.panel-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    const selectedTab = document.getElementById(tabId);
    if (selectedTab) selectedTab.style.display = 'block';

    if (tabId === 'tabNota') document.getElementById('btnTab1')?.classList.add('active');
    if (tabId === 'tabPemohon') document.getElementById('btnTab2')?.classList.add('active');
    if (tabId === 'tabRetur') document.getElementById('btnTab3')?.classList.add('active');
    if (tabId === 'tabPembelian') document.getElementById('btnTab4')?.classList.add('active');
    if (tabId === 'tabOpname') document.getElementById('btnTab5')?.classList.add('active');
}

function switchViewTable(viewType) {
    const secNota = document.getElementById('notaTableSection');
    const secIntransit = document.getElementById('intransitTableSection');
    const secPembelian = document.getElementById('pembelianTableSection');
    const secOpname = document.getElementById('opnameTableSection');

    const btnNota = document.getElementById('viewBtnNota');
    const btnIntransit = document.getElementById('viewBtnIntransit');
    const btnPembelian = document.getElementById('viewBtnPembelian');
    const btnOpname = document.getElementById('viewBtnOpname');

    [secNota, secIntransit, secPembelian, secOpname].forEach(s => s && (s.style.display = 'none'));
    [btnNota, btnIntransit, btnPembelian, btnOpname].forEach(b => b && b.classList.remove('active'));

    if (viewType === 'notaTable') {
        if (secNota) secNota.style.display = 'block';
        if (btnNota) btnNota.classList.add('active');
    } else if (viewType === 'intransitTable') {
        if (secIntransit) secIntransit.style.display = 'block';
        if (btnIntransit) btnIntransit.classList.add('active');
    } else if (viewType === 'pembelianTable') {
        if (secPembelian) secPembelian.style.display = 'block';
        if (btnPembelian) btnPembelian.classList.add('active');
    } else if (viewType === 'opnameTable') {
        if (secOpname) secOpname.style.display = 'block';
        if (btnOpname) btnOpname.classList.add('active');
    }
}

function switchMainPage(pageType) {
    const formSection = document.getElementById('formPageSection');
    const tableSection = document.getElementById('tablePageSection');
    const btnForm = document.getElementById('navBtnForm');
    const btnTable = document.getElementById('navBtnTable');

    if (window.innerWidth <= 992) {
        if (pageType === 'formPage') {
            if (formSection) formSection.style.display = 'block';
            if (tableSection) tableSection.style.display = 'none';
            if (btnForm) btnForm.classList.add('active');
            if (btnTable) btnTable.classList.remove('active');
        } else if (pageType === 'tablePage') {
            if (formSection) formSection.style.display = 'none';
            if (tableSection) tableSection.style.display = 'block';
            if (btnForm) btnForm.classList.remove('active');
            if (btnTable) btnTable.classList.add('active');
        }
    } else {
        if (formSection) formSection.style.display = '';
        if (tableSection) tableSection.style.display = '';
    }
}

function populateDropdownIntransit() {
    const idPinjamSelect = document.getElementById('idPinjamSelect');
    const returIdPinjamSelect = document.getElementById('returIdPinjamSelect');

    if (idPinjamSelect) {
        idPinjamSelect.innerHTML = '<option value="">🚫 -- Tanpa Tautan (Bukan Kupon Intransit) --</option>';
    }
    if (returIdPinjamSelect) {
        returIdPinjamSelect.innerHTML = '<option value="">⏳ -- Pilih Data Intransit --</option>';
    }

    databaseIntransit.forEach(item => {
        if (item.status === "PENDING" || !item.status) {
            const optText = `⏳ ${item.id || 'REQ'} • ${item.pemohon} [${item.plat}] — (${item.kupon} lbr ${item.bbm})`;
            if (idPinjamSelect) {
                const opt = document.createElement('option');
                opt.value = item.id;
                opt.textContent = optText;
                idPinjamSelect.appendChild(opt);
            }
            if (returIdPinjamSelect) {
                const opt = document.createElement('option');
                opt.value = item.id;
                opt.textContent = optText;
                returIdPinjamSelect.appendChild(opt);
            }
        }
    });

    applyCustomSelectToAll();
}

function applyCustomSelectToAll() {
    const allSelects = document.querySelectorAll('select');
    allSelects.forEach(select => {
        if (select.id) {
            renderCustomSelect(select.id);
        }
    });
}

function renderCustomSelect(selectId) {
    const selectEl = document.getElementById(selectId);
    if (!selectEl) return;

    let wrapper = selectEl.closest('.custom-select-wrapper');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'custom-select-wrapper';
        selectEl.parentNode.insertBefore(wrapper, selectEl);
        wrapper.appendChild(selectEl);
        selectEl.style.display = 'none';

        const trigger = document.createElement('div');
        trigger.className = 'custom-select-trigger';
        trigger.innerHTML = `<span class="custom-select-trigger-text"></span><span class="custom-select-arrow">▼</span>`;
        wrapper.appendChild(trigger);

        const popover = document.createElement('div');
        popover.className = 'custom-select-popover';
        popover.innerHTML = `
            <div class="custom-select-search-box">
                <input type="text" class="custom-select-input-search" placeholder="🔍 Cari pilihan...">
            </div>
            <div class="custom-select-options-list"></div>
        `;
        wrapper.appendChild(popover);

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.custom-select-wrapper').forEach(w => w !== wrapper && w.classList.remove('open'));
            wrapper.classList.toggle('open');
            if (wrapper.classList.contains('open')) {
                const searchInp = popover.querySelector('.custom-select-input-search');
                if (searchInp) {
                    searchInp.value = '';
                    if (selectEl.options.length > 5) {
                        popover.querySelector('.custom-select-search-box').style.display = 'block';
                        searchInp.focus();
                    } else {
                        popover.querySelector('.custom-select-search-box').style.display = 'none';
                    }
                    buildOptions();
                }
            }
        });

        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) wrapper.classList.remove('open');
        });

        selectEl.addEventListener('change', () => {
            updateTriggerText();
            buildOptions();
        });
    }

    const triggerText = wrapper.querySelector('.custom-select-trigger-text');
    const optionsList = wrapper.querySelector('.custom-select-options-list');
    const searchInp = wrapper.querySelector('.custom-select-input-search');

    function updateTriggerText() {
        const selectedOpt = selectEl.options[selectEl.selectedIndex];
        if (selectedOpt && selectedOpt.value && (selectId === 'idPinjamSelect' || selectId === 'returIdPinjamSelect')) {
            const item = databaseIntransit.find(i => i.id === selectedOpt.value);
            if (item) {
                triggerText.innerHTML = `⏳ <strong>${escapeHTML(item.pemohon)}</strong> [${escapeHTML(item.plat)}] (${item.kupon} lbr ${escapeHTML(item.bbm)})`;
                return;
            }
        }
        if (selectedOpt) {
            triggerText.textContent = selectedOpt.text;
        } else if (selectEl.options.length > 0) {
            triggerText.textContent = selectEl.options[0].text;
        } else {
            triggerText.textContent = '-- Pilih --';
        }
    }

    function buildOptions(filterQuery = '') {
        optionsList.innerHTML = '';
        const q = filterQuery.toLowerCase().trim();

        // 1. Specialized handling for Intransit Selects
        if (selectId === 'idPinjamSelect' || selectId === 'returIdPinjamSelect') {
            const defaultOpt = selectEl.options[0];
            if (defaultOpt && (!q || defaultOpt.text.toLowerCase().includes(q))) {
                const card = document.createElement('div');
                card.className = `custom-select-option-card ${selectEl.value === defaultOpt.value ? 'selected' : ''}`;
                card.innerHTML = `<div class="custom-select-option-head"><strong>${escapeHTML(defaultOpt.text)}</strong></div>`;
                card.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectEl.value = defaultOpt.value;
                    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                    updateTriggerText();
                    wrapper.classList.remove('open');
                    buildOptions();
                });
                optionsList.appendChild(card);
            }

            databaseIntransit.forEach(item => {
                if (item.status === "PENDING" || !item.status) {
                    const matchString = `${item.id} ${item.pemohon} ${item.plat} ${item.bbm}`.toLowerCase();
                    if (q && !matchString.includes(q)) return;

                    const isSelected = selectEl.value === item.id;
                    const card = document.createElement('div');
                    card.className = `custom-select-option-card ${isSelected ? 'selected' : ''}`;

                    card.innerHTML = `
                        <div class="custom-select-option-head">
                            <span>⏳ <strong>${escapeHTML(item.pemohon)}</strong></span>
                            <span class="custom-select-option-badge">${escapeHTML(item.id || 'REQ')}</span>
                        </div>
                        <div class="custom-select-option-sub">
                            🚗 ${escapeHTML(item.plat)} • 🎫 ${item.kupon} lbr (${escapeHTML(item.bbm)})
                        </div>
                    `;

                    card.addEventListener('click', (e) => {
                        e.stopPropagation();
                        selectEl.value = item.id;
                        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                        updateTriggerText();
                        wrapper.classList.remove('open');
                        buildOptions();
                    });

                    optionsList.appendChild(card);
                }
            });
        }
        // 2. Generic handling for all other Select elements
        else {
            Array.from(selectEl.options).forEach((opt, idx) => {
                if (q && !opt.text.toLowerCase().includes(q)) return;

                const isSelected = (selectEl.value === opt.value) || (selectEl.selectedIndex === idx && !selectEl.value);
                const card = document.createElement('div');
                card.className = `custom-select-option-card ${isSelected ? 'selected' : ''}`;
                card.innerHTML = `<div class="custom-select-option-head"><span>${escapeHTML(opt.text)}</span></div>`;

                card.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectEl.value = opt.value;
                    selectEl.selectedIndex = idx;
                    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                    updateTriggerText();
                    wrapper.classList.remove('open');
                    buildOptions();
                });

                optionsList.appendChild(card);
            });
        }

        if (optionsList.children.length === 0) {
            optionsList.innerHTML = `<div style="padding:14px; text-align:center; color:#64748b; font-size:12px;">Tidak ada opsi yang cocok.</div>`;
        }
    }

    updateTriggerText();
    buildOptions();

    if (searchInp) {
        searchInp.oninput = (e) => buildOptions(e.target.value);
    }
}

function hitungDanRenderSummary() {
    const stokMap = hitungStokPerJenis();
    let grandKupon = 0;
    let grandRp = 0;

    BBM_TYPES.forEach(t => {
        const data = stokMap[t.name];
        if (data) {
            grandKupon += Math.max(0, data.kupon);
            grandRp += Math.max(0, data.rp);
        }
    });

    let totalIntransitKupon = 0;
    let totalIntransitRp = 0;
    databaseIntransit.forEach(item => {
        if (item.status === "PENDING" || !item.status) {
            const jml = Number(item.kupon) || 0;
            const nomPerKupon = getNominalPerKupon(item.bbm);
            totalIntransitKupon += jml;
            totalIntransitRp += (jml * nomPerKupon);
        }
    });

    let totalTerpakaiKupon = 0;
    let totalTerpakaiRp = 0;
    databaseNota.forEach(item => {
        const nominal = Number(item.total) || 0;
        totalTerpakaiRp += nominal;
        let jmlKupon = Number(item.kupon);
        if (!jmlKupon || isNaN(jmlKupon)) jmlKupon = Math.floor(nominal / getNominalPerKupon(item.bbm)) || 1;
        totalTerpakaiKupon += jmlKupon;
    });

    if (document.getElementById('summaryStokBrankas')) {
        document.getElementById('summaryStokBrankas').innerText = `${grandKupon} Lembar`;
        document.getElementById('summaryStokBrankasRp').innerText = `Rp${grandRp.toLocaleString('id-ID')}`;
    }
    if (document.getElementById('summaryStokIntransit')) {
        document.getElementById('summaryStokIntransit').innerText = `${totalIntransitKupon} Lembar`;
        document.getElementById('summaryStokIntransitRp').innerText = `Rp${totalIntransitRp.toLocaleString('id-ID')}`;
    }
    if (document.getElementById('summaryTotalTerpakai')) {
        document.getElementById('summaryTotalTerpakai').innerText = `${totalTerpakaiKupon} Lembar`;
        document.getElementById('summaryTotalTerpakaiRp').innerText = `Rp${totalTerpakaiRp.toLocaleString('id-ID')}`;
    }

    // Trigger Notifikasi Sistem untuk Stok Brankas Kritis (< 10 lembar)
    BBM_TYPES.forEach(t => {
        const data = stokMap[t.name];
        if (data && data.kupon < 10) {
            kirimNotifikasiSistem(
                `🚨 Alert Stok BBM Kritis!`,
                `Fisik voucher ${t.name} di brankas tersisa ${data.kupon} lembar!`,
                `stok-kritis-${t.name}`
            );
        }
    });

    // Trigger Notifikasi Sistem untuk Kupon Intransit Macet (> 3 hari)
    let intransitMacetCount = 0;
    const todayNotif = new Date();
    databaseIntransit.forEach(item => {
        if (item.status === "PENDING" || !item.status) {
            const tgl = new Date(item.tanggal);
            const diff = Math.ceil(Math.abs(todayNotif - tgl) / (1000 * 60 * 60 * 24));
            if (diff > 3) intransitMacetCount++;
        }
    });
    if (intransitMacetCount > 0) {
        kirimNotifikasiSistem(
            `⏳ Alert Kupon Intransit Macet!`,
            `Terdapat ${intransitMacetCount} permohonan kupon yang belum LPJ > 3 hari.`,
            `intransit-aging-alert`
        );
    }

    renderBreakdownStok();
}

function renderBreakdownStok() {
    const container = document.getElementById('stokPerJenisContainer');
    if (!container) return;

    const stokMap = hitungStokPerJenis();
    let html = '<div class="breakdown-title">📊 Rincian Stok Voucher Brankas</div><div class="breakdown-grid">';

    let totalKupon = 0;
    BBM_TYPES.forEach(t => {
        const data = stokMap[t.name];
        if (data) totalKupon += Math.max(0, data.kupon);
    });

    BBM_TYPES.forEach(t => {
        const data = stokMap[t.name];
        if (!data) return;
        const kupon = Math.max(0, data.kupon);
        const rp = kupon * data.nominal;
        const pct = totalKupon > 0 ? Math.round((kupon / totalKupon) * 100) : 0;
        const badgeClass = BADGE_CLASS_MAP[t.name] || 'badge-default';

        html += `
            <div class="breakdown-item">
                <div class="breakdown-item-header">
                    <span class="badge ${badgeClass}">${escapeHTML(cleanBbmDisplay(t.name))}</span>
                    <span class="breakdown-kupon">${kupon} lbr</span>
                </div>
                <div class="breakdown-bar-track">
                    <div class="breakdown-bar-fill ${badgeClass}" style="width: ${pct}%"></div>
                </div>
                <div class="breakdown-item-footer">
                    <span class="breakdown-rp">Rp${rp.toLocaleString('id-ID')}</span>
                    <span class="breakdown-pct">${pct}%</span>
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

// ============================================================
// STOK OPNAME DYNAMIC FORM & HANDLERS
// ============================================================
function renderOpnameFormInputs() {
    const container = document.getElementById('opnameInputsContainer');
    if (!container) return;

    const stokMap = hitungStokPerJenis();
    let html = '';

    BBM_TYPES.forEach((t, idx) => {
        const key = matchBbmKey(t.name);
        const stokSys = key && stokMap[key] ? Math.max(0, stokMap[key].kupon) : 0;

        html += `
            <div class="opname-row-item">
                <div class="opname-item-head">
                    <span class="opname-item-name">${escapeHTML(t.name)}</span>
                    <span class="opname-item-sys">Sistem: <strong>${stokSys}</strong> lbr</span>
                </div>
                <div class="opname-inputs-flex">
                    <input type="number" id="opname_input_${idx}" class="opname-field" data-bbm="${t.name}" data-sys="${stokSys}" data-nominal="${t.nominalKupon}" min="0" value="${stokSys}" oninput="updateOpnameDiff(${idx})">
                    <span id="opname_diff_${idx}" class="opname-diff-badge diff-match">Sesuai (0)</span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function updateOpnameDiff(idx) {
    const input = document.getElementById(`opname_input_${idx}`);
    const badge = document.getElementById(`opname_diff_${idx}`);
    if (!input || !badge) return;

    const stokSys = Number(input.dataset.sys) || 0;
    const hitungFisik = Number(input.value) || 0;
    const selisih = hitungFisik - stokSys;

    if (selisih === 0) {
        badge.className = "opname-diff-badge diff-match";
        badge.textContent = "Sesuai (0)";
    } else if (selisih > 0) {
        badge.className = "opname-diff-badge diff-surplus";
        badge.textContent = `Surplus (+${selisih} lbr)`;
    } else {
        badge.className = "opname-diff-badge diff-deficit";
        badge.textContent = `Defisit (${selisih} lbr)`;
    }
}

// ============================================================
// TABEL LAPORAN RENDERING
// ============================================================
function renderTabel() {
    const tbody = document.getElementById('tabelBody');
    if (!tbody) return;

    const tglMulai = document.getElementById('filterTglMulai')?.value;
    const tglSelesai = document.getElementById('filterTglSelesai')?.value;
    const filterBbm = document.getElementById('filterBbm')?.value;
    const filterKendaraan = document.getElementById('filterKendaraan')?.value?.trim()?.toUpperCase();
    const sortBy = document.getElementById('sortBy')?.value || 'tanggal-desc';

    let filteredData = [...databaseNota];

    if (tglMulai) filteredData = filteredData.filter(item => item.tanggal && item.tanggal >= tglMulai);
    if (tglSelesai) filteredData = filteredData.filter(item => item.tanggal && item.tanggal <= tglSelesai);

    if (filterBbm) {
        const filterKey = matchBbmKey(filterBbm);
        filteredData = filteredData.filter(item => {
            if (!item.bbm) return false;
            const itemKey = matchBbmKey(item.bbm);
            if (filterKey && itemKey) {
                return filterKey === itemKey;
            }
            return item.bbm.toUpperCase().includes(filterBbm.toUpperCase());
        });
    }

    if (filterKendaraan) {
        filteredData = filteredData.filter(item =>
            (item.plat && item.plat.toUpperCase().includes(filterKendaraan)) ||
            (item.pemohon && item.pemohon.toUpperCase().includes(filterKendaraan))
        );
    }

    filteredData.sort((a, b) => {
        if (sortBy === 'tanggal-asc') return new Date(a.tanggal) - new Date(b.tanggal);
        if (sortBy === 'tanggal-desc') return new Date(b.tanggal) - new Date(a.tanggal);
        if (sortBy === 'harga-asc') return (a.total || 0) - (b.total || 0);
        if (sortBy === 'harga-desc') return (b.total || 0) - (a.total || 0);
        return 0;
    });

    let totalNominalFilter = 0;
    let totalKuponFilter = 0;
    let htmlAccumulator = '';

    filteredData.forEach((item) => {
        const nominal = Number(item.total) || 0;
        let jmlKupon = Number(item.kupon);
        if (!jmlKupon || isNaN(jmlKupon)) jmlKupon = Math.floor(nominal / getNominalPerKupon(item.bbm)) || 1;

        totalNominalFilter += nominal;
        totalKuponFilter += jmlKupon;

        const badgeClass = BADGE_CLASS_MAP[item.bbm] || 'badge-default';
        let tombolFotoHtml = `<span style="color:#94a3b8; font-size:11px;">Tanpa Foto</span>`;

        if (item.fotoUrl && String(item.fotoUrl).startsWith("http")) {
            tombolFotoHtml = `<a href="${encodeURI(item.fotoUrl)}" target="_blank" class="btn-view-photo">🔗 Drive</a>`;
        } else if (item.foto && String(item.foto).startsWith("data:image")) {
            const originalIndex = databaseNota.indexOf(item);
            tombolFotoHtml = `<button class="btn-view-photo" onclick="bukaModalFoto(${originalIndex})">👁️ Pratinjau</button>`;
        }

        const originalIndex = databaseNota.indexOf(item);
        const aksiHtml = `
            <div style="display:flex; gap:4px; justify-content:center;">
                <button class="btn-view-photo" onclick="bukaEditNota(${originalIndex})">✏️</button>
                <button class="btn-view-photo" style="color:#f43f5e" onclick="konfirmasiHapusNota(${originalIndex})">🗑️</button>
            </div>
        `;

        htmlAccumulator += `
            <tr>
                <td style="font-family:monospace; font-weight:700;">${escapeHTML(item.no || '-')}</td>
                <td>${escapeHTML(formatTanggalIndo(item.tanggal))}</td>
                <td><span class="badge ${badgeClass}">${escapeHTML(cleanBbmDisplay(item.bbm || '-'))}</span></td>
                <td><strong>${escapeHTML(item.plat || '-')}</strong></td>
                <td>${escapeHTML(item.pemohon || '-')}</td>
                <td class="text-center" style="font-weight:700; color:#1e3a8a;">${jmlKupon} lbr</td>
                <td class="text-right" style="font-weight:700">Rp${nominal.toLocaleString('id-ID')}</td>
                <td class="text-center">${tombolFotoHtml}</td>
                <td class="text-center">${aksiHtml}</td>
            </tr>
        `;
    });
    tbody.innerHTML = htmlAccumulator;

    if (filteredData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="color:#64748b; padding:24px;">Tidak ada data log pengeluaran LPJ.</td></tr>`;
    }

    const filterTotalKupon = document.getElementById('filterTotalKupon');
    const filterTotalRp = document.getElementById('filterTotalRp');
    if (filterTotalKupon) filterTotalKupon.textContent = `${totalKuponFilter.toLocaleString('id-ID')} lbr`;
    if (filterTotalRp) filterTotalRp.textContent = `Rp${totalNominalFilter.toLocaleString('id-ID')}`;
}

function renderTabelIntransit() {
    const tbody = document.getElementById('tabelIntransitBody');
    if (!tbody) return;

    const today = new Date();
    let htmlAccumulator = '';

    databaseIntransit.forEach(item => {
        if (item.status === "PENDING" || !item.status) {
            const tglAmbil = new Date(item.tanggal);
            const diffTime = Math.abs(today - tglAmbil);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            let ageBadge = `<span class="badge badge-default">${diffDays} Hari</span>`;
            if (diffDays > 7) {
                ageBadge = `<span class="badge badge-alert">⚠️ ${diffDays} Hari (Kritis)</span>`;
            } else if (diffDays > 3) {
                ageBadge = `<span class="badge badge-warning">🔔 ${diffDays} Hari</span>`;
            }

            const waText = encodeURIComponent(`Halo Mas ${item.pemohon}, mengingatkan permohonan kupon BBM ${item.kupon} lembar ${cleanBbmDisplay(item.bbm)} (${item.plat}) tanggal ${formatTanggalIndo(item.tanggal)} belum diserahkan LPJ Nota SPBU nya. Mohon bantuannya untuk segera di-LPJ kan. Terima kasih! - Logistik KPPD Bantul`);
            const waLink = `https://wa.me/?text=${waText}`;

            htmlAccumulator += `
                <tr>
                    <td style="font-family:monospace; font-weight:700;">${escapeHTML(item.id || 'REQ')}</td>
                    <td>${escapeHTML(formatTanggalIndo(item.tanggal))}</td>
                    <td style="font-weight:700; color:#1e3a8a;">${escapeHTML(item.pemohon || '-')}</td>
                    <td>${escapeHTML(item.plat || '-')}</td>
                    <td>${escapeHTML(cleanBbmDisplay(item.bbm || '-'))}</td>
                    <td class="text-center" style="font-weight:700; color:#d97706;">${item.kupon} lbr</td>
                    <td class="text-center">${ageBadge}</td>
                    <td class="text-center">
                        <a href="${waLink}" target="_blank" class="btn-wa-remind">📲 Ingatkan WA</a>
                    </td>
                </tr>
            `;
        }
    });
    tbody.innerHTML = htmlAccumulator;

    if (htmlAccumulator === '') {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="color:#64748b; padding:24px;">Tidak ada kupon intransit pending.</td></tr>`;
    }
}

function renderTabelPembelian() {
    const tbody = document.getElementById('tabelPembelianBody');
    if (!tbody) return;

    let htmlAccumulator = '';
    databasePembelian.forEach(item => {
        const jmlKupon = Number(item.kupon) || 0;
        const nomPerKupon = getNominalPerKupon(item.barang);
        const totalRp = jmlKupon * nomPerKupon;
        const badgeClass = BADGE_CLASS_MAP[item.barang] || 'badge-default';

        htmlAccumulator += `
            <tr>
                <td><strong>${escapeHTML(item.bulan || '-')}</strong></td>
                <td><span class="badge ${badgeClass}">${escapeHTML(cleanBbmDisplay(item.barang || '-'))}</span></td>
                <td class="text-center" style="font-weight:700; color:#1e3a8a;">${jmlKupon} lbr</td>
                <td class="text-right">Rp${nomPerKupon.toLocaleString('id-ID')}</td>
                <td class="text-right" style="font-weight:700;">Rp${totalRp.toLocaleString('id-ID')}</td>
                <td class="text-center">-</td>
            </tr>
        `;
    });
    tbody.innerHTML = htmlAccumulator;
}

function renderTabelOpname() {
    const tbody = document.getElementById('tabelOpnameBody');
    if (!tbody) return;

    let htmlAccumulator = '';
    databaseOpname.forEach(item => {
        const selisih = Number(item.selisih) || 0;
        const nom = getNominalPerKupon(item.bbm);
        const valSelisih = selisih * nom;

        let selisihText = `<span style="color:#059669; font-weight:800;">0 (Sesuai)</span>`;
        if (selisih > 0) selisihText = `<span style="color:#2563eb; font-weight:800;">+${selisih} lbr (Surplus)</span>`;
        if (selisih < 0) selisihText = `<span style="color:#e11d48; font-weight:800;">${selisih} lbr (Defisit)</span>`;

        htmlAccumulator += `
            <tr>
                <td>${escapeHTML(formatTanggalIndo(item.tanggal))}</td>
                <td><strong>${escapeHTML(item.keterangan || 'Opname Fisik')}</strong></td>
                <td>${escapeHTML(cleanBbmDisplay(item.bbm))}</td>
                <td class="text-center">${item.stokSistem} lbr</td>
                <td class="text-center" style="font-weight:700;">${item.hitungFisik} lbr</td>
                <td class="text-center">${selisihText}</td>
                <td class="text-right" style="font-weight:700;">Rp${valSelisih.toLocaleString('id-ID')}</td>
            </tr>
        `;
    });
    tbody.innerHTML = htmlAccumulator;

    if (databaseOpname.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:#64748b; padding:24px;">Belum ada riwayat stok opname fisik.</td></tr>`;
    }
}

// ============================================================
// MODAL LIGHTBOX & PREVIEW FOTO
// ============================================================
function bukaModalFoto(index) {
    const item = databaseNota[index];
    if (!item) return;
    const fotoSrc = item.fotoUrl || item.foto;
    if (!fotoSrc) {
        showToast("⚠️ Bukti foto nota tidak tersedia", "warning");
        return;
    }
    const modal = document.getElementById('photoViewerModal');
    const img = document.getElementById('modalPhotoImage');
    const title = document.getElementById('modalPhotoTitle');
    if (modal && img) {
        img.src = fotoSrc;
        if (title) title.innerText = `Detail Bukti Nota ${item.no || ''} (${item.plat || ''})`;
        modal.style.display = 'flex';
    }
}

function tutupModalFoto() {
    const modal = document.getElementById('photoViewerModal');
    if (modal) modal.style.display = 'none';
}

// ============================================================
// MODAL EDIT NOTA
// ============================================================
function bukaEditNota(index) {
    const item = databaseNota[index];
    if (!item) return;
    document.getElementById('editNotaRowIndex').value = index;
    document.getElementById('editNoTransaksi').value = item.no || '';
    document.getElementById('editTanggalNota').value = item.tanggal || '';
    document.getElementById('editPlatNomor').value = item.plat || '';
    document.getElementById('editJenisBbm').value = item.bbm || '';
    document.getElementById('editTotalHarga').value = item.total || 0;
    document.getElementById('editJmlKupon').value = item.kupon || 1;
    document.getElementById('editNamaPemohon').value = item.pemohon || '';

    const modal = document.getElementById('editNotaModal');
    if (modal) modal.style.display = 'flex';
}

function tutupModalEdit() {
    const modal = document.getElementById('editNotaModal');
    if (modal) modal.style.display = 'none';
}

// ============================================================
// MODAL HAPUS NOTA
// ============================================================
function konfirmasiHapusNota(index) {
    const item = databaseNota[index];
    if (!item) return;
    pendingDeleteAction = { type: 'nota', index: index, item: item };
    const msg = document.getElementById('confirmDeleteMsg');
    if (msg) msg.innerText = `Apakah Anda yakin ingin menghapus Nota ${item.no || ''} (${item.plat}) seharga Rp${(item.total || 0).toLocaleString('id-ID')}?`;
    const modal = document.getElementById('confirmDeleteModal');
    if (modal) modal.style.display = 'flex';
}

function tutupModalHapus() {
    pendingDeleteAction = null;
    const modal = document.getElementById('confirmDeleteModal');
    if (modal) modal.style.display = 'none';
}

function eksekusiHapus() {
    if (!pendingDeleteAction) return;
    if (pendingDeleteAction.type === 'nota') {
        const index = pendingDeleteAction.index;
        const item = pendingDeleteAction.item;
        databaseNota.splice(index, 1);

        if (SPREADSHEET_WEBAPP_URL) {
            fetchWithAuth({ action: 'hapus_nota', rowIndex: item.rowIndex || (index + 2) })
                .then(() => muatDataDariSpreadsheet());
        }

        showToast("🗑️ Data Nota berhasil dihapus", "info");
        renderTabel();
        hitungDanRenderSummary();
    }
    tutupModalHapus();
}

// ============================================================
// PRESET FILTER TANGGAL & RESET
// ============================================================
function setQuickDateFilter(preset) {
    const tglMulai = document.getElementById('filterTglMulai');
    const tglSelesai = document.getElementById('filterTglSelesai');
    if (!tglMulai || !tglSelesai) return;

    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));

    const today = new Date();
    const formatYMD = (d) => getLocalDateYMD(d);

    if (preset === 'semua') {
        tglMulai.value = '';
        tglSelesai.value = '';
        document.getElementById('btnPresetSemua')?.classList.add('active');
    } else if (preset === 'today') {
        tglMulai.value = formatYMD(today);
        tglSelesai.value = formatYMD(today);
        document.getElementById('btnPresetToday')?.classList.add('active');
    } else if (preset === 'thisMonth') {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        tglMulai.value = formatYMD(firstDay);
        tglSelesai.value = formatYMD(lastDay);
        document.getElementById('btnPresetThisMonth')?.classList.add('active');
    } else if (preset === 'lastMonth') {
        const firstDayLast = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastDayLast = new Date(today.getFullYear(), today.getMonth(), 0);
        tglMulai.value = formatYMD(firstDayLast);
        tglSelesai.value = formatYMD(lastDayLast);
        document.getElementById('btnPresetLastMonth')?.classList.add('active');
    }
    renderTabel();
}

function resetAllFilters() {
    const filterTglMulai = document.getElementById('filterTglMulai');
    const filterTglSelesai = document.getElementById('filterTglSelesai');
    const filterBbm = document.getElementById('filterBbm');
    const filterKendaraan = document.getElementById('filterKendaraan');
    const sortBy = document.getElementById('sortBy');

    if (filterTglMulai) filterTglMulai.value = '';
    if (filterTglSelesai) filterTglSelesai.value = '';
    if (filterBbm) filterBbm.value = '';
    if (filterKendaraan) filterKendaraan.value = '';
    if (sortBy) sortBy.value = 'tanggal-desc';

    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('btnPresetSemua')?.classList.add('active');

    renderTabel();
    showToast("🧹 Filter telah di-reset", "info");
}

function scrollToFilterMenu() {
    const filterBar = document.querySelector('.filter-bar');
    const contentPanel = document.querySelector('.content-panel');
    if (filterBar) {
        filterBar.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (contentPanel) {
        contentPanel.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// ============================================================
// CLIENT-SIDE IMAGE COMPRESSION & OPTIMIZATION (MOBILE PERFORMA)
// ============================================================
function compressImageFile(file, maxWidth = 1280, maxHeight = 1280, quality = 0.78) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type || !file.type.startsWith('image/')) {
            reject(new Error("File bukan gambar valid"));
            return;
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth || height > maxHeight) {
                    if (width / height > maxWidth / maxHeight) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedBase64);
            };
            img.onerror = (err) => reject(err);
            img.src = evt.target.result;
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
    });
}

function debounce(func, wait = 250) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// ============================================================
// UPLOAD FOTO & PREVIEW SCANNER (DENGAN KOMPRESI CLIENT-SIDE)
// ============================================================
function setupPhotoUploadListeners() {
    const inputs = [document.getElementById('fileNota'), document.getElementById('fileNotaKamera')];
    const scanStatus = document.getElementById('scanStatus');

    inputs.forEach(input => {
        if (!input) return;
        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (scanStatus) {
                scanStatus.style.display = 'block';
                scanStatus.className = 'scan-status-alert';
                scanStatus.innerHTML = '<span>⏳</span> Membaca & Mengompres Foto Nota...';
            }

            try {
                const compressedBase64 = await compressImageFile(file, 1280, 1280, 0.78);
                tempCurrentBase64 = compressedBase64;
                if (scanStatus) {
                    scanStatus.className = 'scan-status-alert success';
                    scanStatus.innerHTML = '<span>✅</span> Foto Nota SPBU Terlampir (Dikompresi)!';
                    setTimeout(() => scanStatus.style.display = 'none', 3000);
                }
                showToast("📸 Foto nota berhasil diunggah & dikompresi", "success");
            } catch (err) {
                console.error("Gagal mengompres foto, menggunakan fallback:", err);
                const reader = new FileReader();
                reader.onload = (evt) => {
                    tempCurrentBase64 = evt.target.result;
                    if (scanStatus) {
                        scanStatus.className = 'scan-status-alert success';
                        scanStatus.innerHTML = '<span>✅</span> Foto Nota SPBU Terlampir!';
                        setTimeout(() => scanStatus.style.display = 'none', 3000);
                    }
                    showToast("📸 Foto nota berhasil diunggah", "success");
                };
                reader.readAsDataURL(file);
            }
        });
    });
}

// ============================================================
// INTERACTIVE AUTO-FILL RULES & SAFE STOCK DISPLAY
// ============================================================
function setupInteractiveHelpers() {
    const platNota = document.getElementById('platNomor');
    const bbmNota = document.getElementById('jenisBbm');
    if (platNota && bbmNota) {
        platNota.addEventListener('change', () => {
            const rule = KENDARAAN_RULES.find(r => r.plat === platNota.value);
            if (rule && rule.bbm) bbmNota.value = rule.bbm;
        });
    }

    const platPemohon = document.getElementById('platPemohon');
    const bbmPemohon = document.getElementById('bbmPemohon');
    const infoSisa = document.getElementById('infoSisaStok');
    const sisaText = document.getElementById('sisaStokJenis');

    function updateSisaDisplay() {
        if (!bbmPemohon || !infoSisa || !sisaText) return;
        const selectedBbm = bbmPemohon.value;
        if (!selectedBbm) {
            infoSisa.style.display = 'none';
            return;
        }
        const stokMap = hitungStokPerJenis();
        const key = matchBbmKey(selectedBbm);
        const sisa = key && stokMap[key] ? Math.max(0, stokMap[key].kupon) : 0;
        sisaText.textContent = sisa;
        infoSisa.style.display = 'block';
    }

    if (platPemohon && bbmPemohon) {
        platPemohon.addEventListener('change', () => {
            const rule = KENDARAAN_RULES.find(r => r.plat === platPemohon.value);
            if (rule && rule.bbm) {
                bbmPemohon.value = rule.bbm;
                updateSisaDisplay();
            }
        });
    }

    if (bbmPemohon) {
        bbmPemohon.addEventListener('change', updateSisaDisplay);
    }
}

// ============================================================
// REALTIME TABLE FILTERS LISTENERS (DEBOUNCED FOR PERFORMANCE)
// ============================================================
function setupTableFilterListeners() {
    const filterElements = [
        document.getElementById('filterTglMulai'),
        document.getElementById('filterTglSelesai'),
        document.getElementById('filterBbm'),
        document.getElementById('filterKendaraan'),
        document.getElementById('sortBy')
    ];

    const debouncedRender = debounce(() => renderTabel(), 250);

    filterElements.forEach(el => {
        if (!el) return;
        el.addEventListener('input', debouncedRender);
        el.addEventListener('change', () => renderTabel());
    });
}

// ============================================================
// CETAK BERITA ACARA REKONSILIASI
// ============================================================
function bukaModalCetakBA() {
    const modal = document.getElementById('printBAModal');
    const tbody = document.getElementById('baTableBody');
    if (!modal || !tbody) return;

    const stokMap = hitungStokPerJenis();
    let htmlAccumulator = '';

    let grandFisikRp = 0;
    const today = new Date();
    const hariArr = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const bulanArr = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const tglIndoStr = `${hariArr[today.getDay()]}, ${String(today.getDate()).padStart(2, '0')} ${bulanArr[today.getMonth()]} ${today.getFullYear()}`;

    const baHariTanggal = document.getElementById('baHariTanggal');
    if (baHariTanggal) baHariTanggal.textContent = tglIndoStr;

    BBM_TYPES.forEach((t, i) => {
        const key = matchBbmKey(t.name);
        const data = stokMap[key] || { kupon: 0, rp: 0 };
        const kuponFisik = Math.max(0, data.kupon);
        const totalFisikRp = kuponFisik * t.nominalKupon;
        grandFisikRp += totalFisikRp;

        htmlAccumulator += `
            <tr>
                <td style="text-align:center;">${i + 1}</td>
                <td>${escapeHTML(t.name)}</td>
                <td style="text-align:right;">Rp${t.nominalKupon.toLocaleString('id-ID')}</td>
                <td style="text-align:center;">-</td>
                <td style="text-align:center;">-</td>
                <td style="text-align:center;">-</td>
                <td style="text-align:center; font-weight:bold;">${kuponFisik} lbr</td>
                <td style="text-align:center; color:#059669; font-weight:bold;">0</td>
            </tr>
        `;
    });
    tbody.innerHTML = htmlAccumulator;

    const baTotalNilaiFisik = document.getElementById('baTotalNilaiFisik');
    if (baTotalNilaiFisik) baTotalNilaiFisik.textContent = `Rp${grandFisikRp.toLocaleString('id-ID')}`;

    modal.style.display = 'flex';
}

function tutupModalCetakBA() {
    const modal = document.getElementById('printBAModal');
    if (modal) modal.style.display = 'none';
}

// ============================================================
// CUSTOM INDONESIAN DATE PICKER POPOVER COMPONENT
// ============================================================
function applyCustomDatePickerToAll() {
    const dateInputs = document.querySelectorAll('input[type="date"]');
    dateInputs.forEach(input => {
        if (input.id) renderCustomDatePicker(input.id);
    });
}

function renderCustomDatePicker(inputId) {
    const inputEl = document.getElementById(inputId);
    if (!inputEl) return;

    let wrapper = inputEl.closest('.custom-datepicker-wrapper');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'custom-datepicker-wrapper';
        inputEl.parentNode.insertBefore(wrapper, inputEl);
        wrapper.appendChild(inputEl);

        const popover = document.createElement('div');
        popover.className = 'custom-datepicker-popover';
        wrapper.appendChild(popover);

        inputEl.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.custom-datepicker-wrapper').forEach(w => w !== wrapper && w.classList.remove('open'));
            wrapper.classList.toggle('open');
            if (wrapper.classList.contains('open')) {
                const rect = wrapper.getBoundingClientRect();
                if (rect.left + 285 > window.innerWidth - 15) {
                    popover.style.left = 'auto';
                    popover.style.right = '0';
                } else {
                    popover.style.left = '0';
                    popover.style.right = 'auto';
                }
                renderCalendar();
            }
        });

        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) wrapper.classList.remove('open');
        });
    }

    const popover = wrapper.querySelector('.custom-datepicker-popover');
    let viewDate = inputEl.value ? new Date(inputEl.value) : new Date();
    if (isNaN(viewDate.getTime())) viewDate = new Date();

    const bulanIndo = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

    function renderCalendar() {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();

        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const lastDateOfMonth = new Date(year, month + 1, 0).getDate();
        const lastDateOfPrevMonth = new Date(year, month, 0).getDate();

        let html = `
            <div class="datepicker-header">
                <button type="button" class="datepicker-nav-btn prev-month">◀</button>
                <span class="datepicker-month-year">${bulanIndo[month]} ${year}</span>
                <button type="button" class="datepicker-nav-btn next-month">▶</button>
            </div>
            <div class="datepicker-weekdays">
                <span>Min</span><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span>
            </div>
            <div class="datepicker-days-grid">
        `;

        for (let i = firstDayOfMonth; i > 0; i--) {
            html += `<div class="datepicker-day-cell other-month">${lastDateOfPrevMonth - i + 1}</div>`;
        }

        const selectedVal = inputEl.value;
        const todayStr = getLocalDateYMD();

        for (let day = 1; day <= lastDateOfMonth; day++) {
            const mStr = String(month + 1).padStart(2, '0');
            const dStr = String(day).padStart(2, '0');
            const dateStr = `${year}-${mStr}-${dStr}`;

            let classes = 'datepicker-day-cell';
            if (dateStr === selectedVal) classes += ' selected';
            if (dateStr === todayStr) classes += ' today';

            html += `<div class="${classes}" data-date="${dateStr}">${day}</div>`;
        }

        html += `
            </div>
            <div class="datepicker-footer">
                <button type="button" class="datepicker-today-btn">⚡ Hari Ini</button>
                <button type="button" class="btn-action outline" style="min-height:30px; padding:4px 10px; font-size:11px;" onclick="document.querySelectorAll('.custom-datepicker-wrapper').forEach(w=>w.classList.remove('open'))">Tutup</button>
            </div>
        `;

        popover.innerHTML = html;

        popover.querySelector('.prev-month').onclick = (e) => {
            e.stopPropagation();
            viewDate.setMonth(viewDate.getMonth() - 1);
            renderCalendar();
        };

        popover.querySelector('.next-month').onclick = (e) => {
            e.stopPropagation();
            viewDate.setMonth(viewDate.getMonth() + 1);
            renderCalendar();
        };

        popover.querySelector('.datepicker-today-btn').onclick = (e) => {
            e.stopPropagation();
            const todayYMD = getLocalDateYMD();
            inputEl.value = todayYMD;
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            wrapper.classList.remove('open');
        };

        popover.querySelectorAll('.datepicker-day-cell[data-date]').forEach(cell => {
            cell.onclick = (e) => {
                e.stopPropagation();
                const targetDate = cell.dataset.date;
                inputEl.value = targetDate;
                inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                wrapper.classList.remove('open');
            };
        });
    }
}

// DOM LOADED & EVENT HANDLERS
document.addEventListener('DOMContentLoaded', () => {
    registerServiceWorker();
    periksaStatusNotifikasi();
    populateVehicleAndBbmDropdowns();
    setupPhotoUploadListeners();
    setupInteractiveHelpers();
    setupTableFilterListeners();
    applyCustomDatePickerToAll();

    if (document.getElementById('tglOpname')) document.getElementById('tglOpname').value = getLocalDateYMD();
    if (document.getElementById('tanggalNota')) document.getElementById('tanggalNota').value = getLocalDateYMD();
    if (document.getElementById('tglAmbil')) document.getElementById('tglAmbil').value = getLocalDateYMD();

    // ============ LOGIN FORM HANDLER ============
    const formLogin = document.getElementById('formLogin');
    if (formLogin) {
        formLogin.addEventListener('submit', (e) => {
            e.preventDefault();
            const password = document.getElementById('loginPassword').value;
            const submitBtn = document.getElementById('loginSubmitBtn');
            const btnText = submitBtn ? submitBtn.querySelector('.login-btn-text') : null;
            const btnLoading = submitBtn ? submitBtn.querySelector('.login-btn-loading') : null;
            const errorDiv = document.getElementById('loginError');

            if (btnText) btnText.style.display = 'none';
            if (btnLoading) btnLoading.style.display = 'inline';
            if (errorDiv) errorDiv.style.display = 'none';
            if (submitBtn) submitBtn.disabled = true;

            fetch(SPREADSHEET_WEBAPP_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'login', password: password })
            })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success' && data.token) {
                    setAuthToken(data.token);
                    showMainApp();
                    muatDataDariSpreadsheet();
                    showToast('\u2705 Login berhasil! Selamat datang.', 'success');
                } else {
                    if (errorDiv) {
                        errorDiv.textContent = data.message || 'Password salah!';
                        errorDiv.style.display = 'block';
                    }
                }
            })
            .catch(err => {
                console.error('Login error:', err);
                if (errorDiv) {
                    errorDiv.textContent = 'Gagal terhubung ke server. Coba lagi.';
                    errorDiv.style.display = 'block';
                }
            })
            .finally(() => {
                if (btnText) btnText.style.display = 'inline';
                if (btnLoading) btnLoading.style.display = 'none';
                if (submitBtn) submitBtn.disabled = false;
            });
        });
    }

    // ============ SESSION CHECK ON PAGE LOAD ============
    if (isLoggedIn()) {
        showMainApp();
        muatDataDariSpreadsheet();
    } else {
        showLoginScreen();
    }

    // Form Nota Submit with Manual Voucher Sheet Support
    const formNota = document.getElementById('formNota');
    if (formNota) {
        formNota.addEventListener('submit', (e) => {
            e.preventDefault();
            const no = document.getElementById('noTransaksi').value.trim();
            const tanggal = document.getElementById('tanggalNota').value;
            const bbm = document.getElementById('jenisBbm').value;
            const plat = document.getElementById('platNomor').value;
            const total = parseInt(document.getElementById('totalHarga').value, 10);
            const pemohon = document.getElementById('namaPemohonNota').value.trim();
            const idPinjam = document.getElementById('idPinjamSelect').value;
            const jumlahKupon = parseInt(document.getElementById('jumlahKuponNota').value, 10) || 1;

            const newNota = { no, tanggal, bbm, plat, total, pemohon, idPinjam, foto: tempCurrentBase64, kupon: jumlahKupon };
            databaseNota.unshift(newNota);

            if (idPinjam) {
                const intransitItem = databaseIntransit.find(i => i.id === idPinjam);
                if (intransitItem) intransitItem.status = "DISERAHKAN";
            }

            if (SPREADSHEET_WEBAPP_URL) {
                fetchWithAuth({ action: 'simpan_nota', ...newNota })
                    .then(() => muatDataDariSpreadsheet())
                    .catch(() => {
                        // Rollback: hapus entry yang gagal disimpan
                        const idx = databaseNota.indexOf(newNota);
                        if (idx !== -1) databaseNota.splice(idx, 1);
                        renderTabel();
                        hitungDanRenderSummary();
                        showToast('⚠️ Gagal simpan ke server, data lokal di-rollback.', 'warning');
                    });
            }

            formNota.reset();
            tempCurrentBase64 = "";
            document.getElementById('tanggalNota').value = getLocalDateYMD();
            renderTabel();
            populateDropdownIntransit();
            hitungDanRenderSummary();
            showToast(`✅ LPJ Nota (${jumlahKupon} voucher kertas) berhasil disimpan!`, 'success');
        });
    }

    // Form Edit Nota Submit Handler
    const formEditNota = document.getElementById('formEditNota');
    if (formEditNota) {
        formEditNota.addEventListener('submit', (e) => {
            e.preventDefault();
            const index = parseInt(document.getElementById('editNotaRowIndex').value, 10);
            if (isNaN(index) || index < 0 || !databaseNota[index]) return;

            const item = databaseNota[index];
            item.no = document.getElementById('editNoTransaksi').value.trim();
            item.tanggal = document.getElementById('editTanggalNota').value;
            item.plat = document.getElementById('editPlatNomor').value;
            item.bbm = document.getElementById('editJenisBbm').value;
            item.total = parseInt(document.getElementById('editTotalHarga').value, 10) || 0;
            item.kupon = parseInt(document.getElementById('editJmlKupon').value, 10) || 1;
            item.pemohon = document.getElementById('editNamaPemohon').value.trim();

            if (SPREADSHEET_WEBAPP_URL) {
                fetchWithAuth({ action: 'edit_nota', rowIndex: item.rowIndex || (index + 2), ...item })
                    .then(() => muatDataDariSpreadsheet());
            }

            tutupModalEdit();
            renderTabel();
            hitungDanRenderSummary();
            showToast("✅ Data Nota LPJ berhasil diperbarui!", "success");
        });
    }

    // Form Penyerahan Kupon (Intransit) Submit Handler
    const formPemohonAmbil = document.getElementById('formPemohonAmbil');
    if (formPemohonAmbil) {
        formPemohonAmbil.addEventListener('submit', (e) => {
            e.preventDefault();
            const tanggal = document.getElementById('tglAmbil').value;
            const pemohon = document.getElementById('namaPemohon').value.trim();
            const plat = document.getElementById('platPemohon').value;
            const bbm = document.getElementById('bbmPemohon').value;
            const kupon = parseInt(document.getElementById('jmlKuponAmbil').value, 10) || 1;
            const id = "REQ-" + Date.now().toString().slice(-4);

            const payload = { id, tanggal, pemohon, plat, bbm, kupon, status: "PENDING" };
            databaseIntransit.unshift(payload);

            if (SPREADSHEET_WEBAPP_URL) {
                fetchWithAuth({ action: 'serah_kupon', ...payload })
                    .then(() => muatDataDariSpreadsheet())
                    .catch(() => {
                        const idx = databaseIntransit.indexOf(payload);
                        if (idx !== -1) databaseIntransit.splice(idx, 1);
                        renderTabelIntransit();
                        hitungDanRenderSummary();
                        showToast('⚠️ Gagal simpan ke server, data lokal di-rollback.', 'warning');
                    });
            }

            formPemohonAmbil.reset();
            document.getElementById('tglAmbil').value = getLocalDateYMD();
            populateDropdownIntransit();
            renderTabelIntransit();
            hitungDanRenderSummary();
            showToast(`🚚 Kupon (${kupon} lbr) berhasil diserahkan ke ${pemohon}!`, "success");
        });
    }

    // Form Retur Kupon Submit Handler
    const formReturKupon = document.getElementById('formReturKupon');
    if (formReturKupon) {
        formReturKupon.addEventListener('submit', (e) => {
            e.preventDefault();
            const idPinjam = document.getElementById('returIdPinjamSelect').value;
            const jmlRetur = parseInt(document.getElementById('jmlRetur').value, 10) || 1;
            const alasan = document.getElementById('alasanRetur').value.trim();

            const itemIndex = databaseIntransit.findIndex(i => i.id === idPinjam);
            if (itemIndex !== -1) {
                const item = databaseIntransit[itemIndex];
                if (jmlRetur >= item.kupon) {
                    item.status = "RETUR";
                } else {
                    item.kupon -= jmlRetur;
                }
            }

            if (SPREADSHEET_WEBAPP_URL) {
                fetchWithAuth({ action: 'retur_kupon', id: idPinjam, jmlRetur, alasan })
                    .then(() => muatDataDariSpreadsheet());
            }

            formReturKupon.reset();
            populateDropdownIntransit();
            renderTabelIntransit();
            hitungDanRenderSummary();
            showToast(`↩️ Kupon (${jmlRetur} lbr) berhasil dikembalikan ke brankas!`, "success");
        });
    }

    // Form Pasokan Kupon Baru Submit Handler
    const formPembelianKupon = document.getElementById('formPembelianKupon');
    if (formPembelianKupon) {
        formPembelianKupon.addEventListener('submit', (e) => {
            e.preventDefault();
            const barang = document.getElementById('pembelianBbm').value;
            const kupon = parseInt(document.getElementById('pembelianKupon').value, 10) || 1;
            const bulan = document.getElementById('pembelianBulan').value;
            const nom = getNominalPerKupon(barang);
            const jumlah = kupon * nom;

            const payload = { bulan, barang, kupon, jumlah };
            databasePembelian.unshift(payload);

            if (SPREADSHEET_WEBAPP_URL) {
                fetchWithAuth({ action: 'pembelian_kupon', ...payload })
                    .then(() => muatDataDariSpreadsheet())
                    .catch(() => {
                        const idx = databasePembelian.indexOf(payload);
                        if (idx !== -1) databasePembelian.splice(idx, 1);
                        renderTabelPembelian();
                        hitungDanRenderSummary();
                        showToast('⚠️ Gagal simpan ke server, data lokal di-rollback.', 'warning');
                    });
            }

            formPembelianKupon.reset();
            renderTabelPembelian();
            hitungDanRenderSummary();
            renderOpnameFormInputs();
            showToast(`📦 Pasokan kupon (${kupon} lbr ${barang}) berhasil ditambahkan!`, "success");
        });
    }

    // Auto calculate voucher count recommendation on total price change
    document.getElementById('totalHarga')?.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10) || 0;
        const bbm = document.getElementById('jenisBbm').value;
        const nom = getNominalPerKupon(bbm);
        if (val > 0) {
            document.getElementById('jumlahKuponNota').value = Math.floor(val / nom) || 1;
        }
    });

    // Form Opname Submit Handler
    const formStokOpname = document.getElementById('formStokOpname');
    if (formStokOpname) {
        formStokOpname.addEventListener('submit', (e) => {
            e.preventDefault();
            const tanggal = document.getElementById('tglOpname').value;
            const keterangan = document.getElementById('keteranganOpname').value.trim();

            const fields = document.querySelectorAll('.opname-field');
            fields.forEach(f => {
                const bbm = f.dataset.bbm;
                const stokSistem = Number(f.dataset.sys) || 0;
                const hitungFisik = Number(f.value) || 0;
                const selisih = hitungFisik - stokSistem;

                const payload = { tanggal, keterangan, bbm, stokSistem, hitungFisik, selisih };
                databaseOpname.unshift(payload);

                if (SPREADSHEET_WEBAPP_URL) {
                    fetchWithAuth({ action: 'stok_opname', ...payload });
                }
            });

            showToast("📊 Hasil Stok Opname Fisik Berhasil Disimpan & Disesuaikan!", "success");
            hitungDanRenderSummary();
            renderTabelOpname();
            renderOpnameFormInputs();
        });
    }
});

