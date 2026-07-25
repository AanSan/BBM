/**
 * ==============================================================
 * APP.JS — Sistem Rekonsiliasi Nota BBM Pertamina
 * Fitur: Display Jumlah Voucher, Fuzzy Matching OCR, Auto-Select Dropdown
 * ==============================================================
 */

const APP_PASSWORD = "Persediaan123";

// Opsi BBM beserta Nominal Per Kupon
const BBM_TYPES = [
    { name: "PERTAMAX 20.000", nominalKupon: 20000, keywords: ["PERTAMAX 20", "20.000", "20000"] },
    { name: "PERTAMAX 100.000 (SPBU PIRAMID)", nominalKupon: 100000, keywords: ["PIRAMID", "100.000", "100000"] },
    { name: "PERTAMAX 200.000", nominalKupon: 200000, keywords: ["PERTAMAX 200", "200.000", "200000"] },
    { name: "DEXLITE 200.000", nominalKupon: 200000, keywords: ["DEXLITE 200", "DEXLITE"] },
    { name: "PERTAMINA DEX 200.000", nominalKupon: 200000, keywords: ["PERTAMINA DEX", "DEX 200"] }
];

// Pemetaan Otomatis Kendaraan -> BBM & Kata Kunci Pencarian OCR
const KENDARAAN_RULES = [
    { plat: "AVANZA 86 B", keywords: ["86 B", "86B", "AVANZA 86"], bbm: "PERTAMAX 200.000" },
    { plat: "JEMPOL 1132 BI", keywords: ["1132", "JEMPOL"], bbm: "PERTAMAX 100.000 (SPBU PIRAMID)" },
    { plat: "PICK UP 8243 UA", keywords: ["8243", "PICK UP", "PICKUP"], bbm: "PERTAMAX 200.000" },
    { plat: "SAMLING 7110 UA", keywords: ["7110", "SAMLING"], bbm: "DEXLITE 200.000" },
    { plat: "L300 AB8073BI", keywords: ["8073", "L300", "AB8073BI"], bbm: "DEXLITE 200.000" },
    { plat: "AVANZA 1000 IS", keywords: ["1000 IS", "1000IS", "1000"], bbm: "PERTAMAX 200.000" },
    { plat: "SUPRA 2112 IA", keywords: ["2112 IA", "2112IA"], bbm: "PERTAMAX 20.000" },
    { plat: "SUPRA 2112 UB", keywords: ["2112 UB", "2112UB"], bbm: "PERTAMAX 20.000" },
    { plat: "SUPRA 2859 IS", keywords: ["2859", "SUPRA 2859"], bbm: "PERTAMAX 20.000" },
    { plat: "GODOOR 2422 IF", keywords: ["2422", "GODOOR"], bbm: "PERTAMAX 20.000" },
    { plat: "GENZET", keywords: ["GENZET", "GENSET"], bbm: "DEXLITE 200.000" }
];

const SPREADSHEET_WEBAPP_URL = "https://script.google.com/macros/s/AKfycby9OO1lhr7de9BrOpn-8BShjUu4p5YZ_6cySF8a3fyhn-2ibp_DHVTvrpCop2PLQsy0-w/exec";

let databaseNota = [];
let tempCurrentBase64 = "";

const BADGE_CLASS_MAP = {
    'PERTAMAX 20.000': 'badge-pertalite',
    'PERTAMAX 100.000 (SPBU PIRAMID)': 'badge-pertamax',
    'PERTAMAX 200.000': 'badge-pertamax',
    'DEXLITE 200.000': 'badge-dexlite',
    'PERTAMINA DEX 200.000': 'badge-dex'
};

function muatDataDariSpreadsheet() {
    if (!SPREADSHEET_WEBAPP_URL) return;

    // Tambahkan timestamp anti-cache agar browser selalu mengambil data paling segar
    const fetchUrl = SPREADSHEET_WEBAPP_URL + "?nocache=" + new Date().getTime();

    console.log("Memuat data dari Google Sheets...", fetchUrl);

    fetch(fetchUrl)
        .then(res => res.json())
        .then(data => {
            console.log("Data diterima dari Spreadsheet:", data);
            if (Array.isArray(data)) {
                databaseNota = data;
                renderTabel();
            } else if (data.status === "error") {
                alert("Error Spreadsheet: " + data.message);
            }
        })
        .catch(err => {
            console.error("Gagal memuat data dari Spreadsheet:", err);
        });
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
        if (rawUpper.includes("PIRAMID") || rawUpper.includes("PIRAMIDA")) {
            hasil.bbm = "PERTAMAX 100.000 (SPBU PIRAMID)";
        } else if (rawUpper.includes("DEXLITE")) {
            hasil.bbm = "DEXLITE 200.000";
        } else if (rawUpper.includes("PERTAMINA DEX") || rawUpper.includes("P.DEX")) {
            hasil.bbm = "PERTAMINA DEX 200.000";
        } else if (rawUpper.includes("PERTAMAX")) {
            hasil.bbm = "PERTAMAX 200.000";
        }
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

function hitungJumlahKupon(totalHarga, jenisBbm) {
    let nominalPerKupon = 20000;
    if (jenisBbm.includes("100.000")) nominalPerKupon = 100000;
    else if (jenisBbm.includes("200.000")) nominalPerKupon = 200000;

    const jumlahKupon = Math.floor(totalHarga / nominalPerKupon) || 1;
    const sisa = totalHarga % nominalPerKupon;
    return { jumlahKupon, nominalPerKupon, sisa };
}

function bukaModalFoto(index) {
    const item = databaseNota[index];
    if (!item || (!item.foto && !item.fotoUrl)) {
        alert("Foto tidak tersedia untuk transaksi ini.");
        return;
    }
    const modal = document.getElementById('photoViewerModal');
    document.getElementById('modalPhotoTitle').innerText = `Nota: ${item.no} (${item.plat})`;
    document.getElementById('modalPhotoImage').src = item.foto || item.fotoUrl;
    modal.style.display = 'flex';
}

function tutupModalFoto() {
    const modal = document.getElementById('photoViewerModal');
    if (modal) modal.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    const loginModal = document.getElementById('loginModal');
    const loginForm = document.getElementById('loginForm');
    const appPasswordInput = document.getElementById('appPassword');
    const mainContainer = document.getElementById('mainContainer');

    function izinkanAkses() {
        if (loginModal) loginModal.style.display = 'none';
        if (mainContainer) mainContainer.style.display = 'block';
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

    const fileNota = document.getElementById('fileNota');
    const scanStatus = document.getElementById('scanStatus');
    const formNota = document.getElementById('formNota');

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (scanStatus) {
            scanStatus.style.display = 'block';
            scanStatus.innerText = "Mengompres gambar & memproses OCR...";
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

                if (hasil.bbm) {
                    document.getElementById('jenisBbm').value = hasil.bbm;
                }

                if (scanStatus) scanStatus.innerText = "Selesai! Silakan verifikasi data.";
            }
        } catch (error) {
            if (scanStatus) scanStatus.innerText = `Gagal: ${error.message}`;
        }
    };

    if (fileNota) fileNota.addEventListener('change', handleFileChange);
    const fileNotaKamera = document.getElementById('fileNotaKamera');
    if (fileNotaKamera) fileNotaKamera.addEventListener('change', handleFileChange);

    if (formNota) {
        formNota.addEventListener('submit', (e) => {
            e.preventDefault();

            const no = document.getElementById('noTransaksi').value.trim();
            const tanggal = document.getElementById('tanggalNota').value;
            const bbm = document.getElementById('jenisBbm').value;
            const plat = document.getElementById('platNomor').value;
            const total = parseInt(document.getElementById('totalHarga').value, 10);

            if (databaseNota.some(item => item.no === no)) {
                alert(`⚠️ PERINGATAN REKONSILIASI:\nNomor transaksi ${no} sudah pernah diinput sebelumnya!`);
                return;
            }

            const { jumlahKupon } = hitungJumlahKupon(total, bbm);
            const newNota = { no, tanggal, bbm, plat, total, foto: tempCurrentBase64, kupon: jumlahKupon };

            if (SPREADSHEET_WEBAPP_URL) {
                const submitBtn = formNota.querySelector('.btn-submit');
                const originalText = submitBtn.innerText;
                submitBtn.disabled = true;
                submitBtn.innerText = "Menyimpan...";

                fetch(SPREADSHEET_WEBAPP_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(newNota)
                })
                    .then(res => res.json())
                    .then(response => {
                        if (response.status === "error") throw new Error(response.message);
                        setTimeout(() => muatDataDariSpreadsheet(), 1000);

                        formNota.reset();
                        tempCurrentBase64 = "";
                        if (fileNota) fileNota.value = '';
                        if (fileNotaKamera) fileNotaKamera.value = '';
                        if (scanStatus) scanStatus.style.display = 'none';
                        alert(`✅ Data nota berhasil disimpan! (${jumlahKupon} voucher)`);
                    })
                    .catch(err => alert("Gagal menyimpan: " + err.message))
                    .finally(() => {
                        submitBtn.disabled = false;
                        submitBtn.innerText = originalText;
                    });
            }
        });
    }

    const fByMonth = document.getElementById('filterBulan');
    const fByBbm = document.getElementById('filterBbm');
    const fByPlat = document.getElementById('filterKendaraan');
    const sBy = document.getElementById('sortBy');

    if (fByMonth) fByMonth.addEventListener('change', renderTabel);
    if (fByBbm) fByBbm.addEventListener('change', renderTabel);
    if (fByPlat) fByPlat.addEventListener('input', renderTabel);
    if (sBy) sBy.addEventListener('change', renderTabel);
});

// Ganti bagian renderTabel() di app.js Anda dengan ini:
function renderTabel() {
    const tbody = document.getElementById('tabelBody');
    if (!tbody) return;

    const filterBulan = document.getElementById('filterBulan')?.value;
    const filterBbm = document.getElementById('filterBbm')?.value;
    const filterKendaraan = document.getElementById('filterKendaraan')?.value?.trim()?.toUpperCase();
    const sortBy = document.getElementById('sortBy')?.value || 'tanggal-desc';

    let filteredData = [...databaseNota];

    // Filter Bulan
    if (filterBulan) {
        filteredData = filteredData.filter(item => item.tanggal && item.tanggal.startsWith(filterBulan));
    }

    // Filter BBM (Support Partial Match)
    if (filterBbm) {
        filteredData = filteredData.filter(item => {
            if (!item.bbm) return false;
            return item.bbm.toUpperCase().includes(filterBbm.toUpperCase()) || filterBbm.toUpperCase().includes(item.bbm.toUpperCase());
        });
    }

    // Filter Kendaraan
    if (filterKendaraan) {
        filteredData = filteredData.filter(item => item.plat && item.plat.toUpperCase().includes(filterKendaraan));
    }

    // Sorting Data
    filteredData.sort((a, b) => {
        if (sortBy === 'tanggal-asc') return new Date(a.tanggal) - new Date(b.tanggal);
        if (sortBy === 'tanggal-desc') return new Date(b.tanggal) - new Date(a.tanggal);
        if (sortBy === 'harga-asc') return (a.total || 0) - (b.total || 0);
        if (sortBy === 'harga-desc') return (b.total || 0) - (a.total || 0);
        return 0;
    });

    tbody.innerHTML = '';
    let totalHarga = 0;
    let totalKupon = 0;

    filteredData.forEach((item) => {
        const nominal = Number(item.total) || 0;
        totalHarga += nominal;

        // Hitung kupon jika belum ada
        let jmlKupon = Number(item.kupon);
        if (!jmlKupon || isNaN(jmlKupon)) {
            let nominalPerKupon = 20000;
            if (item.bbm && item.bbm.includes("100.000")) nominalPerKupon = 100000;
            else if (item.bbm && item.bbm.includes("200.000")) nominalPerKupon = 200000;
            jmlKupon = Math.floor(nominal / nominalPerKupon) || 1;
        }
        totalKupon += jmlKupon;

        const badgeClass = BADGE_CLASS_MAP[item.bbm] || 'badge-default';
        let tombolFotoHtml = `<span style="color:#94a3b8; font-size:12px;">Tanpa Foto</span>`;

        if (item.fotoUrl && String(item.fotoUrl).startsWith("http")) {
            tombolFotoHtml = `<a href="${item.fotoUrl}" target="_blank" class="btn-view-photo">🔗 Foto Drive</a>`;
        } else if (item.foto && String(item.foto).startsWith("data:image")) {
            const originalIndex = databaseNota.indexOf(item);
            tombolFotoHtml = `<button class="btn-view-photo" onclick="bukaModalFoto(${originalIndex})">👁️ Foto</button>`;
        }

        tbody.innerHTML += `
            <tr>
                <td class="txt-transaksi">${item.no || '-'}</td>
                <td>${item.tanggal || '-'}</td>
                <td><span class="badge ${badgeClass}">${item.bbm || '-'}</span></td>
                <td>${item.plat || '-'}</td>
                <td class="text-center" style="font-weight:700; color:#2563eb;">${jmlKupon} lbr</td>
                <td class="text-right" style="font-weight:600">Rp${nominal.toLocaleString('id-ID')}</td>
                <td class="text-center">${tombolFotoHtml}</td>
            </tr>
        `;
    });

    if (document.getElementById('summaryTotalNota')) document.getElementById('summaryTotalNota').innerText = filteredData.length;
    if (document.getElementById('summaryTotalKupon')) document.getElementById('summaryTotalKupon').innerText = `${totalKupon} Lembar`;
    if (document.getElementById('summaryTotalHarga')) document.getElementById('summaryTotalHarga').innerText = `Rp${totalHarga.toLocaleString('id-ID')}`;
}