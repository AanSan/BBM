/**
 * ==============================================================
 * APP.JS — Sistem Manajemen & Rekonsiliasi Kupon BBM KPPD Bantul
 * Fully Updated: Fast Initial Load, Mobile View Sync & Data Security
 * ==============================================================
 */

const APP_PASSWORD = "Persediaan123";

const BBM_TYPES = [
    { name: "PERTAMAX 20.000", label: "🟢 PERTAMAX Rp20.000 (Motor Ops)", nominalKupon: 20000 },
    { name: "PERTAMAX 100.000 (SPBU PIRAMID)", label: "🔵 PERTAMAX Rp100.000 (SPBU Piramid)", nominalKupon: 100000 },
    { name: "PERTAMAX 200.000", label: "🔵 PERTAMAX Rp200.000 (Mobil Ops)", nominalKupon: 200000 },
    { name: "DEXLITE 200.000", label: "🟠 DEXLITE Rp200.000 (Diesel Ops)", nominalKupon: 200000 },
    { name: "PERTAMINA DEX 200.000", label: "🟣 PERTAMINA DEX Rp200.000", nominalKupon: 200000 }
];

const KENDARAAN_RULES = [
    { plat: "AVANZA 86 B", label: "🚘 Avanza AB 86 B (Ops Utama)", keywords: ["86 B", "86B", "AVANZA 86"], bbm: "PERTAMAX 200.000" },
    { plat: "JEMPOL 1132 BI", label: "🚙 Jempol AB 1132 BI (SPBU Piramid)", keywords: ["1132", "JEMPOL"], bbm: "PERTAMAX 100.000 (SPBU PIRAMID)" },
    { plat: "PICK UP 8243 UA", label: "🛻 Pick Up AB 8243 UA (Logistik)", keywords: ["8243", "PICK UP", "PICKUP"], bbm: "PERTAMAX 200.000" },
    { plat: "SAMLING 7110 UA", label: "🚐 Samling AB 7110 UA (Dexlite)", keywords: ["7110", "SAMLING"], bbm: "DEXLITE 200.000" },
    { plat: "L300 AB8073BI", label: "🚐 L300 AB 8073 BI (Dexlite Ops)", keywords: ["8073", "L300", "AB8073BI"], bbm: "DEXLITE 200.000" },
    { plat: "AVANZA 1000 IS", label: "🚘 Avanza AB 1000 IS (Ops Kantor)", keywords: ["1000 IS", "1000IS", "1000"], bbm: "PERTAMAX 200.000" },
    { plat: "SUPRA 2112 IA", label: "🛵 Supra AB 2112 IA (Motor Ops)", keywords: ["2112 IA", "2112IA"], bbm: "PERTAMAX 20.000" },
    { plat: "SUPRA 2112 UB", label: "🛵 Supra AB 2112 UB (Motor Ops)", keywords: ["2112 UB", "2112UB"], bbm: "PERTAMAX 20.000" },
    { plat: "SUPRA 2859 IS", label: "🛵 Supra AB 2859 IS (Motor Ops)", keywords: ["2859", "SUPRA 2859"], bbm: "PERTAMAX 20.000" },
    { plat: "GODOOR 2422 IF", label: "🛵 Godoor AB 2422 IF (Motor Ops)", keywords: ["2422", "GODOOR"], bbm: "PERTAMAX 20.000" },
    { plat: "GENZET", label: "⚡ Genset Operasional (Dexlite)", keywords: ["GENZET", "GENSET"], bbm: "DEXLITE 200.000" }
];

const SPREADSHEET_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbzVA2Bx19LabaLUACF6tUdHDNDVZg1evvBDAH9Nhl89fRdxakTglWfz3FgDNZ1AAf9Shw/exec";

// Local App States
let databaseNota = [];
let databaseIntransit = [];
let databaseSaldoAwal = [];
let databasePembelian = [];
let tempCurrentBase64 = "";

const BADGE_CLASS_MAP = {
    'PERTAMAX 20.000': 'badge-pertalite',
    'PERTAMAX 100.000 (SPBU PIRAMID)': 'badge-pertamax',
    'PERTAMAX 200.000': 'badge-pertamax',
    'DEXLITE 200.000': 'badge-dexlite',
    'PERTAMINA DEX 200.000': 'badge-dex'
};

/**
 * Fungsi utilitas untuk melepaskan karakter HTML guna mencegah Cross-Site Scripting (XSS)
 */
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
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
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function populateVehicleAndBbmDropdowns() {
    const platSelects = [document.getElementById('platNomor'), document.getElementById('platPemohon')];
    const bbmSelects = [
        document.getElementById('jenisBbm'),
        document.getElementById('bbmPemohon'),
        document.getElementById('pembelianBbm'),
        document.getElementById('filterBbm')
    ];

    platSelects.forEach(select => {
        if (!select) return;
        const currentVal = select.value;
        const firstOptText = select.id === 'platNomor' ? '🚗 -- Pilih Kendaraan Ops KPPD --' : '🚗 -- Pilih Kendaraan Ops --';
        select.innerHTML = `<option value="">${firstOptText}</option>`;
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
}

function setupCustomSelect(selectEl) {
    if (!selectEl || selectEl.dataset.customInit === "true") return;

    selectEl.style.display = 'none';
    selectEl.dataset.customInit = "true";

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select-wrapper';
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);

    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';

    const updateTriggerText = () => {
        const selectedOpt = selectEl.options[selectEl.selectedIndex];
        trigger.innerHTML = `
            <span>${selectedOpt ? escapeHTML(selectedOpt.textContent) : '-- Pilih --'}</span>
            <span class="custom-select-arrow">▼</span>
        `;
    };
    updateTriggerText();
    wrapper.appendChild(trigger);

    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'custom-select-options';
    wrapper.appendChild(optionsContainer);

    const rebuildOptions = () => {
        optionsContainer.innerHTML = '';
        Array.from(selectEl.options).forEach((opt, idx) => {
            const item = document.createElement('div');
            item.className = `custom-option-item ${idx === selectEl.selectedIndex ? 'selected' : ''}`;
            item.textContent = opt.textContent;
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                selectEl.selectedIndex = idx;
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                updateTriggerText();
                rebuildOptions();
                wrapper.classList.remove('open');
            });
            optionsContainer.appendChild(item);
        });
    };

    rebuildOptions();

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.custom-select-wrapper').forEach(w => {
            if (w !== wrapper) w.classList.remove('open');
        });
        wrapper.classList.toggle('open');
    });

    selectEl.addEventListener('change', () => {
        updateTriggerText();
        rebuildOptions();
    });

    const observer = new MutationObserver(() => {
        updateTriggerText();
        rebuildOptions();
    });
    observer.observe(selectEl, { childList: true, subtree: true });
}

function initAllCustomSelects() {
    document.querySelectorAll('select').forEach(selectEl => {
        setupCustomSelect(selectEl);
    });
}

document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select-wrapper').forEach(w => w.classList.remove('open'));
});

function getNominalPerKupon(namaBbm) {
    if (!namaBbm) return 20000;
    var str = String(namaBbm).toUpperCase();

    if (str.includes("100.000")) return 100000;
    if (str.includes("200.000")) return 200000;
    if (str.includes("20.000")) return 20000;
    if (str.includes("DEXLITE") || str.includes("DEX")) return 200000;

    return 20000;
}

// 1. TAMPILKAN INDIKATOR LOADING SKELETON SAAT SPREADSHEET MEMUAT DATA
function tampilkanSkeletonLoading() {
    const tbody = document.getElementById('tabelBody');
    const tbodyIntransit = document.getElementById('tabelIntransitBody');
    const tbodyPembelian = document.getElementById('tabelPembelianBody');

    const loadingRow = `
        <tr>
            <td colspan="8" class="text-center" style="padding: 24px; color: #64748b;">
                <span style="display:inline-block; margin-right:8px;">⏳</span> 
                <strong>Mengambil data persediaan terbaru dari cloud...</strong>
            </td>
        </tr>
    `;

    if (tbody) tbody.innerHTML = loadingRow;
    if (tbodyIntransit) tbodyIntransit.innerHTML = loadingRow;
    if (tbodyPembelian) tbodyPembelian.innerHTML = loadingRow;
}

// 2. FETCH & SYNCHRONIZE DARI SPREADSHEET
function muatDataDariSpreadsheet() {
    if (!SPREADSHEET_WEBAPP_URL) return;

    tampilkanSkeletonLoading(); // Tampilkan loading sebelum fetch selesai

    const fetchUrl = SPREADSHEET_WEBAPP_URL + "?nocache=" + new Date().getTime();

    fetch(fetchUrl)
        .then(async res => {
            if (!res.ok) {
                throw new Error(`Server HTTP Error ${res.status}: URL Web App Google Apps Script tidak valid / 404.`);
            }
            const contentType = res.headers.get("content-type");
            if (contentType && !contentType.includes("application/json")) {
                throw new Error("Respon server berupa HTML (bukan JSON). Pastikan deployment Apps Script diset 'Who has access: Anyone'.");
            }
            return res.json();
        })
        .then(data => {
            if (data && data.nota) {
                databaseNota = data.nota || [];
                databaseIntransit = data.intransit || [];
                databaseSaldoAwal = data.saldoAwal || [];
                databasePembelian = data.pembelian || [];
            }
            populateDropdownIntransit();
            renderTabel();
            renderTabelIntransit();
            renderTabelPembelian();
            hitungDanRenderSummary();
        })
        .catch(err => {
            console.error("Gagal sinkronisasi data:", err);
            showToast("⚠️ Gagal sinkronisasi cloud: " + err.message, "error");
            renderTabel();
            renderTabelIntransit();
            renderTabelPembelian();
            hitungDanRenderSummary();
        });
}

function switchTab(tabId) {
    document.querySelectorAll('.panel-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    const selectedTab = document.getElementById(tabId);
    if (selectedTab) selectedTab.style.display = 'block';

    if (tabId === 'tabNota') document.getElementById('btnTab1').classList.add('active');
    if (tabId === 'tabPemohon') document.getElementById('btnTab2').classList.add('active');
    if (tabId === 'tabRetur') document.getElementById('btnTab3').classList.add('active');
    if (tabId === 'tabPembelian') document.getElementById('btnTab4').classList.add('active');
}

function switchViewTable(viewType) {
    const secNota = document.getElementById('notaTableSection');
    const secIntransit = document.getElementById('intransitTableSection');
    const secPembelian = document.getElementById('pembelianTableSection');

    const btnNota = document.getElementById('viewBtnNota');
    const btnIntransit = document.getElementById('viewBtnIntransit');
    const btnPembelian = document.getElementById('viewBtnPembelian');

    if (secNota) secNota.style.display = 'none';
    if (secIntransit) secIntransit.style.display = 'none';
    if (secPembelian) secPembelian.style.display = 'none';

    if (btnNota) btnNota.classList.remove('active');
    if (btnIntransit) btnIntransit.classList.remove('active');
    if (btnPembelian) btnPembelian.classList.remove('active');

    if (viewType === 'notaTable') {
        if (secNota) secNota.style.display = 'block';
        if (btnNota) btnNota.classList.add('active');
    } else if (viewType === 'intransitTable') {
        if (secIntransit) secIntransit.style.display = 'block';
        if (btnIntransit) btnIntransit.classList.add('active');
    } else if (viewType === 'pembelianTable') {
        if (secPembelian) secPembelian.style.display = 'block';
        if (btnPembelian) btnPembelian.classList.add('active');
    }
}

// 3. SWITCHER HALAMAN UTAMA DI MOBILE HP (DISERTAI AUTO RE-RENDER)
function switchMainPage(pageType) {
    const formSection = document.getElementById('formPageSection');
    const tableSection = document.getElementById('tablePageSection');
    const btnForm = document.getElementById('navBtnForm');
    const btnTable = document.getElementById('navBtnTable');

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

        // Refresh tabel secara otomatis saat menu "Data & Laporan" dibuka
        renderTabel();
        renderTabelIntransit();
        renderTabelPembelian();
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
            const optText = `⏳ ${item.id || 'REQ'} — ${item.pemohon} [${item.plat}] (${item.kupon} lbr ${item.bbm})`;

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
}

function hitungDanRenderSummary() {
    let totalSaldoAwalKupon = 0;
    let totalSaldoAwalRp = 0;
    if (databaseSaldoAwal && Array.isArray(databaseSaldoAwal)) {
        databaseSaldoAwal.forEach(item => {
            totalSaldoAwalKupon += Number(item.kupon) || 0;
            totalSaldoAwalRp += Number(item.jumlah) || 0;
        });
    }

    let totalPembelianKupon = 0;
    let totalPembelianRp = 0;
    if (databasePembelian && Array.isArray(databasePembelian)) {
        databasePembelian.forEach(item => {
            const jmlKupon = Number(item.kupon) || 0;
            const nomPerKupon = getNominalPerKupon(item.barang);
            totalPembelianKupon += jmlKupon;
            totalPembelianRp += (jmlKupon * nomPerKupon);
        });
    }

    let totalTerpakaiKupon = 0;
    let totalTerpakaiRp = 0;
    databaseNota.forEach(item => {
        const nominal = Number(item.total) || 0;
        totalTerpakaiRp += nominal;

        let jmlKupon = Number(item.kupon);
        if (!jmlKupon || isNaN(jmlKupon)) {
            jmlKupon = Math.floor(nominal / getNominalPerKupon(item.bbm)) || 1;
        }
        totalTerpakaiKupon += jmlKupon;
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

    const sisaBrankasKupon = Math.max(0, (totalSaldoAwalKupon + totalPembelianKupon) - (totalTerpakaiKupon + totalIntransitKupon));
    const sisaBrankasRp = Math.max(0, (totalSaldoAwalRp + totalPembelianRp) - (totalTerpakaiRp + totalIntransitRp));

    if (document.getElementById('summaryStokBrankas')) {
        document.getElementById('summaryStokBrankas').innerText = `${sisaBrankasKupon} Lembar`;
        document.getElementById('summaryStokBrankasRp').innerText = `Rp${sisaBrankasRp.toLocaleString('id-ID')}`;
    }
    if (document.getElementById('summaryStokIntransit')) {
        document.getElementById('summaryStokIntransit').innerText = `${totalIntransitKupon} Lembar`;
        document.getElementById('summaryStokIntransitRp').innerText = `Rp${totalIntransitRp.toLocaleString('id-ID')}`;
    }
    if (document.getElementById('summaryTotalTerpakai')) {
        document.getElementById('summaryTotalTerpakai').innerText = `${totalTerpakaiKupon} Lembar`;
        document.getElementById('summaryTotalTerpakaiRp').innerText = `Rp${totalTerpakaiRp.toLocaleString('id-ID')}`;
    }

    ['summaryStokBrankas', 'summaryStokIntransit', 'summaryTotalTerpakai'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('stat-value-pop');
            void el.offsetWidth;
            el.classList.add('stat-value-pop');
        }
    });
}

function setQuickDateFilter(type) {
    const elMulai = document.getElementById('filterTglMulai');
    const elSelesai = document.getElementById('filterTglSelesai');

    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));

    const now = new Date();
    const formatDate = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    if (type === 'today') {
        const todayStr = formatDate(now);
        if (elMulai) elMulai.value = todayStr;
        if (elSelesai) elSelesai.value = todayStr;
        document.getElementById('btnPresetToday')?.classList.add('active');
        showToast('⚡ Filter: Data Hari Ini', 'info');
    } else if (type === 'thisMonth') {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        if (elMulai) elMulai.value = formatDate(firstDay);
        if (elSelesai) elSelesai.value = formatDate(lastDay);
        document.getElementById('btnPresetThisMonth')?.classList.add('active');
        showToast('🗓️ Filter: Data Bulan Ini', 'info');
    } else if (type === 'lastMonth') {
        const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
        if (elMulai) elMulai.value = formatDate(firstDay);
        if (elSelesai) elSelesai.value = formatDate(lastDay);
        document.getElementById('btnPresetLastMonth')?.classList.add('active');
        showToast('⏮️ Filter: Data Bulan Lalu', 'info');
    } else {
        if (elMulai) elMulai.value = '';
        if (elSelesai) elSelesai.value = '';
        document.getElementById('btnPresetSemua')?.classList.add('active');
    }

    renderTabel();
}

function resetAllFilters() {
    const elMulai = document.getElementById('filterTglMulai');
    const elSelesai = document.getElementById('filterTglSelesai');
    const elBbm = document.getElementById('filterBbm');
    const elPlat = document.getElementById('filterKendaraan');
    const elSort = document.getElementById('sortBy');

    if (elMulai) elMulai.value = '';
    if (elSelesai) elSelesai.value = '';
    if (elBbm) {
        elBbm.value = '';
        elBbm.dispatchEvent(new Event('change'));
    }
    if (elPlat) elPlat.value = '';
    if (elSort) {
        elSort.value = 'tanggal-desc';
        elSort.dispatchEvent(new Event('change'));
    }

    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('btnPresetSemua')?.classList.add('active');

    renderTabel();
    showToast('🧹 Seluruh filter telah dibersihkan', 'info');
}

function renderTabel() {
    const tbody = document.getElementById('tabelBody');
    if (!tbody) return;

    const tglMulai = document.getElementById('filterTglMulai')?.value;
    const tglSelesai = document.getElementById('filterTglSelesai')?.value;
    const filterBbm = document.getElementById('filterBbm')?.value;
    const filterKendaraan = document.getElementById('filterKendaraan')?.value?.trim()?.toUpperCase();
    const sortBy = document.getElementById('sortBy')?.value || 'tanggal-desc';

    let filteredData = [...databaseNota];

    if (tglMulai) {
        filteredData = filteredData.filter(item => item.tanggal && item.tanggal >= tglMulai);
    }
    if (tglSelesai) {
        filteredData = filteredData.filter(item => item.tanggal && item.tanggal <= tglSelesai);
    }

    if (filterBbm) {
        filteredData = filteredData.filter(item => {
            if (!item.bbm) return false;
            var itemBbmUpper = item.bbm.toUpperCase();
            var targetBbmUpper = filterBbm.toUpperCase();

            if (targetBbmUpper.includes("DEX")) {
                return itemBbmUpper.includes("DEX");
            }
            return itemBbmUpper.includes(targetBbmUpper);
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

    tbody.innerHTML = '';

    let totalNominalFilter = 0;
    let totalKuponFilter = 0;

    filteredData.forEach((item) => {
        const nominal = Number(item.total) || 0;
        let jmlKupon = Number(item.kupon);
        if (!jmlKupon || isNaN(jmlKupon)) {
            jmlKupon = Math.floor(nominal / getNominalPerKupon(item.bbm)) || 1;
        }

        totalNominalFilter += nominal;
        totalKuponFilter += jmlKupon;

        const badgeClass = BADGE_CLASS_MAP[item.bbm] || 'badge-default';
        let tombolFotoHtml = `<span style="color:#94a3b8; font-size:11px;">Tanpa Foto</span>`;

        if (item.fotoUrl && String(item.fotoUrl).startsWith("http")) {
            tombolFotoHtml = `<a href="${encodeURI(item.fotoUrl)}" target="_blank" rel="noopener noreferrer" class="btn-view-photo">🔗 Drive</a>`;
        } else if (item.foto && String(item.foto).startsWith("data:image")) {
            const originalIndex = databaseNota.indexOf(item);
            tombolFotoHtml = `<button class="btn-view-photo" onclick="bukaModalFoto(${originalIndex})">👁️ Pratinjau</button>`;
        }

        tbody.innerHTML += `
            <tr>
                <td style="font-family:monospace; font-weight:700;">${escapeHTML(item.no || '-')}</td>
                <td>${escapeHTML(item.tanggal || '-')}</td>
                <td><span class="badge ${badgeClass}">${escapeHTML(item.bbm || '-')}</span></td>
                <td><strong>${escapeHTML(item.plat || '-')}</strong></td>
                <td>${escapeHTML(item.pemohon || '-')}</td>
                <td class="text-center" style="font-weight:700; color:#1e3a8a;">${jmlKupon} lbr</td>
                <td class="text-right" style="font-weight:700">Rp${nominal.toLocaleString('id-ID')}</td>
                <td class="text-center">${tombolFotoHtml}</td>
            </tr>
        `;
    });

    if (filteredData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="color:#64748b; padding:24px;">Tidak ada data log pengeluaran nota.</td></tr>`;
    } else {
        tbody.innerHTML += `
            <tr style="background-color: #f1f5f9; font-weight: 800; border-top: 2px solid #cbd5e1;">
                <td colspan="5" style="text-align: right; text-transform: uppercase;">Total Hasil Filter:</td>
                <td class="text-center" style="color: #1e3a8a;">${totalKuponFilter} lbr</td>
                <td class="text-right" style="color: #059669;">Rp${totalNominalFilter.toLocaleString('id-ID')}</td>
                <td></td>
            </tr>
        `;
    }
}

function renderTabelIntransit() {
    const tbody = document.getElementById('tabelIntransitBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    const today = new Date();

    databaseIntransit.forEach(item => {
        if (item.status === "PENDING" || !item.status) {
            const tglAmbil = new Date(item.tanggal);
            const diffTime = Math.abs(today - tglAmbil);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            let ageBadge = `<span class="badge badge-default">${diffDays} Hari</span>`;
            if (diffDays > 7) {
                ageBadge = `<span class="badge badge-alert">⚠️ ${diffDays} Hari</span>`;
            }

            tbody.innerHTML += `
                <tr>
                    <td style="font-family:monospace; font-weight:700;">${escapeHTML(item.id || 'REQ')}</td>
                    <td>${escapeHTML(item.tanggal || '-')}</td>
                    <td style="font-weight:700; color:#1e3a8a;">${escapeHTML(item.pemohon || '-')}</td>
                    <td>${escapeHTML(item.plat || '-')}</td>
                    <td>${escapeHTML(item.bbm || '-')}</td>
                    <td class="text-center" style="font-weight:700; color:#d97706;">${item.kupon} lbr</td>
                    <td class="text-center">${ageBadge}</td>
                    <td class="text-center"><span class="badge badge-dexlite">DIBEBAANKAN</span></td>
                </tr>
            `;
        }
    });

    if (tbody.innerHTML === '') {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="color:#64748b; padding:24px;">Tidak ada kupon intransit (Semua permintaan kupon telah di-LPJ).</td></tr>`;
    }
}

function renderTabelPembelian() {
    const tbody = document.getElementById('tabelPembelianBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    let totalKuponBeli = 0;
    let totalNominalBeli = 0;

    databasePembelian.forEach(item => {
        const jmlKupon = Number(item.kupon) || 0;
        const nomPerKupon = getNominalPerKupon(item.barang);
        const totalRp = jmlKupon * nomPerKupon;

        totalKuponBeli += jmlKupon;
        totalNominalBeli += totalRp;

        const badgeClass = BADGE_CLASS_MAP[item.barang] || 'badge-default';

        tbody.innerHTML += `
            <tr>
                <td><strong>${escapeHTML(item.bulan || '-')}</strong></td>
                <td><span class="badge ${badgeClass}">${escapeHTML(item.barang || '-')}</span></td>
                <td class="text-center" style="font-weight:700; color:#1e3a8a;">${jmlKupon} lbr</td>
                <td class="text-right">Rp${nomPerKupon.toLocaleString('id-ID')}</td>
                <td class="text-right" style="font-weight:700;">Rp${totalRp.toLocaleString('id-ID')}</td>
            </tr>
        `;
    });

    if (databasePembelian.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:#64748b; padding:24px;">Belum ada data pembelian kupon.</td></tr>`;
    } else {
        tbody.innerHTML += `
            <tr style="background-color: #f1f5f9; font-weight: 800; border-top: 2px solid #cbd5e1;">
                <td colspan="2" style="text-align: right; text-transform: uppercase;">Total Pembelian:</td>
                <td class="text-center" style="color: #1e3a8a;">${totalKuponBeli} lbr</td>
                <td></td>
                <td class="text-right" style="color: #059669;">Rp${totalNominalBeli.toLocaleString('id-ID')}</td>
            </tr>
        `;
    }
}

function kompresDanUbahKeBase64(fileMentah) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(fileMentah);
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const maxDimensi = 1000;
                let lebar = img.width, tinggi = img.height;

                if (lebar > tinggi && lebar > maxDimensi) {
                    tinggi *= maxDimensi / lebar;
                    lebar = maxDimensi;
                } else if (tinggi > maxDimensi) {
                    lebar *= maxDimensi / tinggi;
                    tinggi = maxDimensi;
                }

                canvas.width = lebar;
                canvas.height = tinggi;
                ctx.drawImage(img, 0, 0, lebar, tinggi);
                resolve(canvas.toDataURL('image/jpeg', 0.75));
            };
            img.onerror = () => reject(new Error("Format file tidak didukung."));
            img.src = event.target.result;
        };
        reader.onerror = () => reject(new Error("Gagal membaca file."));
    });
}

function parseNotaText(rawText) {
    const rawUpper = rawText.toUpperCase();
    const cleanText = rawUpper.replace(/[^A-Z0-9]/g, '');
    let hasil = { no: '', tanggal: new Date().toISOString().split('T')[0], bbm: '', plat: '', total: 0 };

    const polaNo = rawUpper.match(/(?:NO\.?\s*TRANS(?:AKSI)?|NO\.?\s*NOTA|TRANS(?:AKSI)?|NOTA|RESI|TICKET|TKT)[:\s#]*([A-Z0-9\/\.\-]+)/i);
    if (polaNo && polaNo[1]) {
        hasil.no = polaNo[1].replace(/[:#\s]/g, '').trim();
    }

    for (const item of KENDARAAN_RULES) {
        const isMatch = item.keywords.some(kw => {
            const cleanKw = kw.replace(/[^A-Z0-9]/g, '');
            return rawUpper.includes(kw) || cleanText.includes(cleanKw);
        });

        if (isMatch) {
            hasil.plat = item.plat;
            hasil.bbm = item.bbm;
            break;
        }
    }

    if (!hasil.bbm) {
        if (rawUpper.includes("PIRAMID")) hasil.bbm = "PERTAMAX 100.000 (SPBU PIRAMID)";
        else if (rawUpper.includes("DEXLITE") || rawUpper.includes("PERTAMINA DEX") || rawUpper.includes("DEX")) hasil.bbm = "DEXLITE 200.000";
        else if (rawUpper.includes("PERTAMAX")) hasil.bbm = "PERTAMAX 200.000";
    }

    const regexHarga = /(?:TOTAL(?:\s*HARGA)?|CASH|BAYAR|RUPIAH|RP)[^0-9]*?(\d[\d\.,]*(?:\s+\d{3})*)/gi;
    let matchHarga, maxTotal = 0;
    while ((matchHarga = regexHarga.exec(rawUpper)) !== null) {
        if (matchHarga[1]) {
            const nominal = parseInt(matchHarga[1].replace(/[^0-9]/g, ''), 10);
            if (!isNaN(nominal) && nominal < 5000000 && nominal > maxTotal) maxTotal = nominal;
        }
    }
    if (maxTotal > 1000) hasil.total = maxTotal;

    const polaTanggal = rawUpper.match(/(\d{2})[-/](\d{2})[-/](\d{2,4})/);
    if (polaTanggal) {
        let thn = polaTanggal[3].length === 2 ? "20" + polaTanggal[3] : polaTanggal[3];
        hasil.tanggal = `${thn}-${polaTanggal[2].padStart(2, '0')}-${polaTanggal[1].padStart(2, '0')}`;
    }

    return hasil;
}

function bukaModalFoto(index) {
    const item = databaseNota[index];
    if (!item || (!item.foto && !item.fotoUrl)) {
        showToast("Foto nota tidak tersedia.", "warning");
        return;
    }
    const modal = document.getElementById('photoViewerModal');
    const modalTitle = document.getElementById('modalPhotoTitle');
    if (modalTitle) {
        modalTitle.textContent = `Nota Transaksi: ${item.no || '-'} (${item.plat || '-'})`;
    }
    document.getElementById('modalPhotoImage').src = item.foto || item.fotoUrl;
    modal.style.display = 'flex';
}

function tutupModalFoto() {
    const modal = document.getElementById('photoViewerModal');
    if (modal) modal.style.display = 'none';
}

function keluarSistem() {
    sessionStorage.removeItem('isAuthenticated');
    showToast("🔒 Sesi ditutup. Mengunci portal...", "info");
    setTimeout(() => {
        location.reload();
    }, 500);
}

// 4. DOM LOADED INITIALIZATION & LISTENERS
document.addEventListener('DOMContentLoaded', () => {
    populateVehicleAndBbmDropdowns();
    initAllCustomSelects();

    const loginModal = document.getElementById('loginModal');
    const loginForm = document.getElementById('loginForm');
    const appPasswordInput = document.getElementById('appPassword');
    const mainContainer = document.getElementById('mainContainer');

    function izinkanAkses() {
        if (loginModal) loginModal.style.display = 'none';
        if (mainContainer) mainContainer.style.display = 'block';

        // Aktifkan view tabel default sejak awal
        switchViewTable('notaTable');

        // Set mode tampilan mobile default
        if (window.innerWidth <= 992) {
            switchMainPage('formPage');
        }

        // Tampilkan indikator memuat data
        tampilkanSkeletonLoading();

        // Sync data dari cloud
        muatDataDariSpreadsheet();
    }

    if (sessionStorage.getItem('isAuthenticated') === 'true') izinkanAkses();

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (appPasswordInput.value === APP_PASSWORD) {
                sessionStorage.setItem('isAuthenticated', 'true');
                izinkanAkses();
            } else {
                document.getElementById('loginError').style.display = 'block';
            }
        });
    }

    const platSelect = document.getElementById('platNomor');
    if (platSelect) {
        platSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            const matchRule = KENDARAAN_RULES.find(r => r.plat === val);
            if (matchRule) {
                document.getElementById('jenisBbm').value = matchRule.bbm;
            }
        });
    }

    const idPinjamSelect = document.getElementById('idPinjamSelect');
    if (idPinjamSelect) {
        idPinjamSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            const selectedIntransit = databaseIntransit.find(i => i.id === val);
            if (selectedIntransit) {
                document.getElementById('platNomor').value = selectedIntransit.plat || '';
                document.getElementById('jenisBbm').value = selectedIntransit.bbm || '';
                document.getElementById('namaPemohonNota').value = selectedIntransit.pemohon || '';
            }
        });
    }

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const scanStatus = document.getElementById('scanStatus');
        if (scanStatus) {
            scanStatus.style.display = 'block';
            scanStatus.innerText = "Mengompres gambar & mengekstrak data nota OCR...";
        }

        try {
            const fullBase64 = await kompresDanUbahKeBase64(file);
            tempCurrentBase64 = fullBase64;

            const response = await fetch(SPREADSHEET_WEBAPP_URL, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: "ocr", foto: fullBase64 })
            });

            const data = await response.json();
            if (data.status === "error") throw new Error(data.message);

            if (data.text) {
                const hasil = parseNotaText(data.text);

                if (hasil.no) document.getElementById('noTransaksi').value = hasil.no;
                if (hasil.tanggal) document.getElementById('tanggalNota').value = hasil.tanggal;
                if (hasil.total > 0) document.getElementById('totalHarga').value = hasil.total;

                if (hasil.plat) {
                    const elPlat = document.getElementById('platNomor');
                    elPlat.value = hasil.plat;
                    elPlat.dispatchEvent(new Event('change'));
                }

                if (hasil.bbm) document.getElementById('jenisBbm').value = hasil.bbm;

                if (scanStatus) scanStatus.innerText = "✓ Selesai OCR! Silakan cek kembali data yang terisi.";
            }
        } catch (error) {
            if (scanStatus) scanStatus.innerText = `Gagal OCR: ${error.message}`;
        }
    };

    const fileNota = document.getElementById('fileNota');
    const fileNotaKamera = document.getElementById('fileNotaKamera');
    if (fileNota) fileNota.addEventListener('change', handleFileChange);
    if (fileNotaKamera) fileNotaKamera.addEventListener('change', handleFileChange);

    // Submit Form 1: Nota
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

            if (databaseNota.some(item => item.no === no)) {
                showToast(`⚠️ No Transaksi ${no} sudah tercatat di sistem!`, 'warning');
                return;
            }

            const nominalPerKupon = getNominalPerKupon(bbm);
            const jumlahKupon = Math.floor(total / nominalPerKupon) || 1;
            const newNota = { no, tanggal, bbm, plat, total, pemohon, idPinjam, foto: tempCurrentBase64, kupon: jumlahKupon };

            databaseNota.unshift(newNota);

            if (SPREADSHEET_WEBAPP_URL) {
                const submitBtn = formNota.querySelector('.btn-primary');
                submitBtn.disabled = true;
                submitBtn.innerText = "Menyimpan ke Cloud...";

                fetch(SPREADSHEET_WEBAPP_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(newNota)
                })
                    .then(res => res.json())
                    .then(() => {
                        formNota.reset();
                        tempCurrentBase64 = "";
                        showToast(`✅ Nota BBM (${jumlahKupon} voucher) berhasil diselesaikan!`, 'success');
                        muatDataDariSpreadsheet();
                    })
                    .catch(err => showToast("Gagal menyimpan: " + err.message, 'error'))
                    .finally(() => {
                        submitBtn.disabled = false;
                        submitBtn.innerText = "Simpan Nota & LPJ BBM";
                    });
            } else {
                renderTabel();
                renderTabelIntransit();
                hitungDanRenderSummary();
                formNota.reset();
                showToast(`✅ Nota berhasil disimpan di sistem lokal (${jumlahKupon} voucher)!`, 'success');
            }
        });
    }

    // Submit Form 2: Serah Kupon
    const formPemohonAmbil = document.getElementById('formPemohonAmbil');
    if (formPemohonAmbil) {
        formPemohonAmbil.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = formPemohonAmbil.querySelector('button[type="submit"]');
            const originalText = submitBtn ? submitBtn.innerText : "Serahkan Kupon (Proses Intransit)";
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerText = "Menyimpan ke Cloud...";
            }

            const payload = {
                action: "pemohon_ambil",
                id: "REQ-" + new Date().getTime().toString().slice(-6),
                tanggal: document.getElementById('tglAmbil').value,
                pemohon: document.getElementById('namaPemohon').value.trim(),
                plat: document.getElementById('platPemohon').value,
                bbm: document.getElementById('bbmPemohon').value,
                kupon: parseInt(document.getElementById('jmlKuponAmbil').value, 10),
                status: "PENDING"
            };

            try {
                if (SPREADSHEET_WEBAPP_URL) {
                    const res = await fetch(SPREADSHEET_WEBAPP_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify(payload)
                    });
                    const resData = await res.json();
                    if (resData.status === "error") throw new Error(resData.message);
                }

                databaseIntransit.unshift(payload);
                formPemohonAmbil.reset();
                populateDropdownIntransit();
                renderTabelIntransit();
                hitungDanRenderSummary();
                showToast(`✅ Kupon (${payload.kupon} lembar) diserahkan ke ${payload.pemohon}. Status: Intransit.`, 'success');
            } catch (err) {
                console.error("Gagal menyerahkan kupon:", err);
                showToast("⚠️ Gagal menyimpan ke cloud: " + err.message, 'error');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = originalText;
                }
            }
        });
    }

    // Submit Form 3: Retur Kupon
    const formReturKupon = document.getElementById('formReturKupon');
    if (formReturKupon) {
        formReturKupon.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = formReturKupon.querySelector('button[type="submit"]');
            const originalText = submitBtn ? submitBtn.innerText : "Kembalikan ke Brankas";
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerText = "Memproses Retur...";
            }

            const idPinjam = document.getElementById('returIdPinjamSelect').value;
            const jmlKembali = parseInt(document.getElementById('jmlRetur').value, 10);
            const alasan = document.getElementById('alasanRetur').value.trim();

            const payload = {
                action: "kembalikan_kupon",
                idPinjam,
                jumlahKembali: jmlKembali,
                alasan
            };

            try {
                if (SPREADSHEET_WEBAPP_URL) {
                    const res = await fetch(SPREADSHEET_WEBAPP_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify(payload)
                    });
                    const resData = await res.json();
                    if (resData.status === "error") throw new Error(resData.message);
                    muatDataDariSpreadsheet();
                } else {
                    const targetItem = databaseIntransit.find(i => i.id === idPinjam);
                    if (targetItem) {
                        if (targetItem.kupon > jmlKembali) {
                            targetItem.kupon -= jmlKembali;
                        } else {
                            targetItem.status = "SELESAI";
                        }
                    }
                    populateDropdownIntransit();
                    renderTabelIntransit();
                    hitungDanRenderSummary();
                }

                formReturKupon.reset();
                showToast(`✅ ${jmlKembali} lembar kupon dikembalikan ke brankas.`, 'success');
            } catch (err) {
                console.error("Gagal retur kupon:", err);
                showToast("⚠️ Gagal memproses retur: " + err.message, 'error');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = originalText;
                }
            }
        });
    }

    // Submit Form 4: Pembelian Baru
    const formPembelianKupon = document.getElementById('formPembelianKupon');
    if (formPembelianKupon) {
        formPembelianKupon.addEventListener('submit', async (e) => {
            e.preventDefault();

            const bbm = document.getElementById('pembelianBbm').value;
            const jumlahKupon = parseInt(document.getElementById('pembelianKupon').value, 10);
            const bulan = document.getElementById('pembelianBulan').value.trim();

            const submitBtn = formPembelianKupon.querySelector('.btn-primary') || formPembelianKupon.querySelector('button[type="submit"]');
            const originalText = submitBtn ? submitBtn.innerText : "Tambah Stok Pembelian";

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerText = "Menyimpan ke Sheet...";
            }

            const payload = {
                action: "pembelian_baru",
                bbm: bbm,
                jumlahKupon: jumlahKupon,
                bulan: bulan
            };

            try {
                if (SPREADSHEET_WEBAPP_URL) {
                    const res = await fetch(SPREADSHEET_WEBAPP_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify(payload)
                    });
                    const resData = await res.json();
                    if (resData.status === "error") throw new Error(resData.message);

                    showToast(`✅ Pasokan ${jumlahKupon} lembar ${bbm} (${bulan}) berhasil ditambahkan!`, 'success');
                    formPembelianKupon.reset();
                    muatDataDariSpreadsheet();
                } else {
                    databasePembelian.push({ barang: bbm, kupon: jumlahKupon, bulan: bulan });
                    renderTabelPembelian();
                    hitungDanRenderSummary();
                    formPembelianKupon.reset();
                    showToast(`✅ Pasokan ${jumlahKupon} lembar ${bbm} berhasil ditambahkan!`, 'success');
                }
            } catch (err) {
                console.error("Gagal menyimpan pembelian:", err);
                showToast("⚠️ Gagal menyimpan pembelian: " + err.message, 'error');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = originalText;
                }
            }
        });
    }

    // Filter Events Realtime
    const fTglMulai = document.getElementById('filterTglMulai');
    const fTglSelesai = document.getElementById('filterTglSelesai');
    const fByBbm = document.getElementById('filterBbm');
    const fByPlat = document.getElementById('filterKendaraan');
    const sBy = document.getElementById('sortBy');

    if (fTglMulai) fTglMulai.addEventListener('change', renderTabel);
    if (fTglSelesai) fTglSelesai.addEventListener('change', renderTabel);
    if (fByBbm) fByBbm.addEventListener('change', renderTabel);
    if (fByPlat) fByPlat.addEventListener('input', renderTabel);
    if (sBy) sBy.addEventListener('change', renderTabel);
});