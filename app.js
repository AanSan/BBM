/**
 * ==============================================================
 * APP.JS — Sistem Rekonsiliasi Nota BBM Pertamina (Fixed Build)
 * Fitur: Password Guard, Robust Filter & Sort, Smart Drive Link Detector
 * Compatible dengan GitHub Pages & Static Web Host
 * ==============================================================
 */

const APP_PASSWORD = "Persediaan123";

const BBM_TYPES = [
    { name: "PERTAMAX TURBO", keywords: ["PERTAMAX TURBO", "TURBO"] },
    { name: "PERTAMAX 100.000 (SPBU PIRAMID)", keywords: ["SPBU PIRAMID", "PIRAMID", "PERTAMAX 100"] },
    { name: "PERTAMAX", keywords: ["PERTAMAX", "PERTAMAX 92"] },
    { name: "PERTALITE", keywords: ["PERTALITE", "P_LITE"] },
    { name: "DEXLITE", keywords: ["DEXLITE"] },
    { name: "PERTAMINA DEX", keywords: ["PERTAMINA DEX", "PERTAMINA-DEX", "P. DEX", "P_DEX", "DEX"] },
    { name: "SOLAR", keywords: ["SOLAR", "BIOSOLAR", "BIO SOLAR"] },
];

const DEFAULT_LLM_WHISPERER_KEY = "uf3mDFBoCCQNyVhE0XrJPQ_exEH5zlPTXIVGSMCGNjM";
let activeApiKey = DEFAULT_LLM_WHISPERER_KEY;
let remoteBaseUrl = "https://llmwhisperer-api.us-central.unstract.com/api/v2";

const SPREADSHEET_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbzgkUMeWa1ha0j7LpwEuevDhzSyuWl2BnKMffAiojUuzLNCckpoLgvhoWTjF-KKf2Rm4w/exec";

let databaseNota = [];
let tempCurrentBase64 = ""; // Menampung sementara foto nota yang diupload

const BADGE_CLASS_MAP = {
    'PERTAMAX TURBO': 'badge-turbo',
    'PERTAMAX 100.000 (SPBU PIRAMID)': 'badge-pertamax',
    'PERTAMAX': 'badge-pertamax',
    'PERTALITE': 'badge-pertalite',
    'DEXLITE': 'badge-dexlite',
    'PERTAMINA DEX': 'badge-dex',
    'SOLAR': 'badge-solar'
};

function muatDataDariSpreadsheet() {
    if (!SPREADSHEET_WEBAPP_URL) return;

    console.log("Memuat data dari Google Sheets...");
    fetch(SPREADSHEET_WEBAPP_URL)
        .then(res => res.json())
        .then(data => {
            if (Array.isArray(data)) {
                databaseNota = data;
                renderTabel();
            }
        })
        .catch(err => console.error("Gagal memuat data:", err));
}

function dataURLtoBlob(dataurl) {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

async function pollAndRetrieve(whisperHash, apiKey) {
    const apiBase = (window.location.port === "8080") ? "/api" : remoteBaseUrl;

    const statusUrl = (apiBase === "/api")
        ? `${apiBase}/whisper-status?whisper_hash=${whisperHash}`
        : `${remoteBaseUrl}/whisper-status?whisper_hash=${whisperHash}`;

    const retrieveUrl = (apiBase === "/api")
        ? `${apiBase}/whisper-retrieve?whisper_hash=${whisperHash}`
        : `${remoteBaseUrl}/whisper-retrieve?whisper_hash=${whisperHash}`;

    const headers = { "unstract-key": apiKey };
    const scanStatus = document.getElementById('scanStatus');

    while (true) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (scanStatus) scanStatus.innerText = "Memproses OCR (Menunggu antrean)...";

        const statusResponse = await fetch(statusUrl, { headers });
        if (!statusResponse.ok) throw new Error(`Status OCR gagal: ${statusResponse.status}`);

        const statusData = await statusResponse.json();
        if (statusData.status === "processed") {
            const retrieveResponse = await fetch(retrieveUrl, { headers });
            const retrieveData = await retrieveResponse.json();
            return retrieveData.result_text;
        } else if (statusData.status === "failed") {
            throw new Error("Proses ekstraksi OCR gagal.");
        }
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
                let lebar = img.width;
                let tinggi = img.height;

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
                const base64Kompres = canvas.toDataURL('image/jpeg', 0.75);
                resolve(base64Kompres);
            };
            img.onerror = () => reject(new Error("Format file tidak didukung."));
            img.src = event.target.result;
        };
        reader.onerror = () => reject(new Error("Gagal membaca file."));
    });
}

function highlightInput(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('highlight-input');
        setTimeout(() => el.classList.remove('highlight-input'), 1000);
    }
}

function parseNotaText(rawText) {
    const text = rawText.toUpperCase().replace(/\s+/g, ' ');
    let hasil = { no: '', tanggal: new Date().toISOString().split('T')[0], bbm: '', plat: '', total: 0 };

    const polaNo = text.match(/(?:NO\.?\s*TRANS(?:AKSI)?|NO\.?\s*NOTA|TRANS(?:AKSI)?|NOTA|RESI|TICKET|TKT)[:\s#]*([A-Z0-9\/\.\-]+)/i);
    if (polaNo && polaNo[1]) {
        hasil.no = polaNo[1].replace(/[:#\s]/g, '').trim();
    }

    for (const bbm of BBM_TYPES) {
        if (bbm.keywords.some(k => text.includes(k))) {
            hasil.bbm = bbm.name;
            break;
        }
    }

    const regexHarga = /(?:TOTAL(?:\s*HARGA)?|CASH|BAYAR|RUPIAH|RP)[^0-9]*?(\d[\d\.,]*(?:\s+\d{3})*)/gi;
    let matchHarga, maxTotal = 0;
    while ((matchHarga = regexHarga.exec(text)) !== null) {
        if (matchHarga[1]) {
            const nominal = parseInt(matchHarga[1].replace(/[^0-9]/g, ''), 10);
            if (!isNaN(nominal) && nominal < 2000000 && nominal > maxTotal) maxTotal = nominal;
        }
    }
    if (maxTotal > 1000) hasil.total = maxTotal;

    const polaPlatLabel = text.match(/(?:NO\.?\s*POL(?:ISI)?|PLAT|KENDARAAN|VEHICLE)[:\s]*([A-Z]{1,2}\s*\d{1,5}\s*[A-Z]{0,3})/i);
    if (polaPlatLabel && polaPlatLabel[1]) hasil.plat = polaPlatLabel[1].trim();

    const polaTanggal = text.match(/(\d{2})[-/](\d{2})[-/](\d{2,4})/);
    if (polaTanggal) {
        let thn = polaTanggal[3].length === 2 ? "20" + polaTanggal[3] : polaTanggal[3];
        hasil.tanggal = `${thn}-${polaTanggal[2]}-${polaTanggal[1]}`;
    }

    return hasil;
}

// Buka Modal Foto (Base64)
function bukaModalFoto(index) {
    const item = databaseNota[index];
    if (!item || (!item.foto && !item.fotoUrl)) {
        alert("Foto tidak tersedia untuk transaksi ini.");
        return;
    }

    const modal = document.getElementById('photoViewerModal');
    const modalImg = document.getElementById('modalPhotoImage');
    const modalTitle = document.getElementById('modalPhotoTitle');

    modalTitle.innerText = `Nota: ${item.no} (${item.plat})`;
    modalImg.src = item.foto || item.fotoUrl;
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
    const loginError = document.getElementById('loginError');
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
                if (loginError) loginError.style.display = 'block';
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
            scanStatus.innerText = "Mengompres gambar & memproses OCR via Backend...";
        }

        try {
            const fullBase64 = await kompresDanUbahKeBase64(file);
            tempCurrentBase64 = fullBase64;

            // Kirim base64 ke Google Apps Script untuk diproses OCR
            const response = await fetch(SPREADSHEET_WEBAPP_URL, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: "ocr", foto: fullBase64 })
            });

            const data = await response.json();

            if (data.status === "error") {
                throw new Error(data.message);
            }

            if (data.text) {
                const hasil = parseNotaText(data.text);
                if (hasil.no) document.getElementById('noTransaksi').value = hasil.no;
                if (hasil.tanggal) document.getElementById('tanggalNota').value = hasil.tanggal;
                if (hasil.bbm) document.getElementById('jenisBbm').value = hasil.bbm;
                if (hasil.plat) document.getElementById('platNomor').value = hasil.plat;
                if (hasil.total > 0) document.getElementById('totalHarga').value = hasil.total;

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
            const plat = document.getElementById('platNomor').value.trim().toUpperCase();
            const total = parseInt(document.getElementById('totalHarga').value, 10);

            // Cek Duplikasi Transaksi
            if (databaseNota.some(item => item.no === no)) {
                alert(`⚠️ PERINGATAN REKONSILIASI:\nNomor transaksi ${no} sudah pernah diinput sebelumnya!`);
                return;
            }

            const newNota = { no, tanggal, bbm, plat, total, foto: tempCurrentBase64 };

            if (SPREADSHEET_WEBAPP_URL) {
                const submitBtn = formNota.querySelector('.btn-submit');
                const originalText = submitBtn.innerText;
                submitBtn.disabled = true;
                submitBtn.innerText = "Menyimpan ke Sheets...";

                // Mengirimkan payload JSON dengan text/plain agar tidak memicu CORS Preflight Error di Apps Script
                fetch(SPREADSHEET_WEBAPP_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(newNota)
                })
                    .then(res => res.json())
                    .then(response => {
                        if (response.status === "error") {
                            throw new Error(response.message);
                        }

                        console.log("Data berhasil dikirim. Memuat ulang data...");

                        setTimeout(() => {
                            muatDataDariSpreadsheet();
                        }, 1000);

                        formNota.reset();
                        tempCurrentBase64 = "";
                        if (fileNota) fileNota.value = '';
                        if (fileNotaKamera) fileNotaKamera.value = '';
                        if (scanStatus) scanStatus.style.display = 'none';
                        alert("✅ Data nota berhasil disimpan!");
                    })
                    .catch(err => {
                        console.error("Gagal menyimpan ke Sheets:", err);
                        alert("Gagal menyimpan ke Google Sheets: " + err.message);
                    })
                    .finally(() => {
                        submitBtn.disabled = false;
                        submitBtn.innerText = originalText;
                    });
            } else {
                databaseNota.push(newNota);
                renderTabel();
                formNota.reset();
                tempCurrentBase64 = "";
            }
        });
    }

    // LISTENER EVENT FILTER DAN SORTING
    const fByMonth = document.getElementById('filterBulan');
    const fByBbm = document.getElementById('filterBbm');
    const fByPlat = document.getElementById('filterKendaraan');
    const sBy = document.getElementById('sortBy');

    if (fByMonth) fByMonth.addEventListener('change', renderTabel);
    if (fByBbm) fByBbm.addEventListener('change', renderTabel);
    if (fByPlat) fByPlat.addEventListener('input', renderTabel);
    if (sBy) sBy.addEventListener('change', renderTabel);
});

// FUNGSI RENDER TABEL (FILTER & SORT LENGKAP)
function renderTabel() {
    const tbody = document.getElementById('tabelBody');
    if (!tbody) return;

    const filterBulan = document.getElementById('filterBulan')?.value;
    const filterBbm = document.getElementById('filterBbm')?.value;
    const filterKendaraan = document.getElementById('filterKendaraan')?.value?.trim()?.toUpperCase();
    const sortBy = document.getElementById('sortBy')?.value || 'tanggal-desc';

    let filteredData = [...databaseNota];

    if (filterBulan) {
        filteredData = filteredData.filter(item => item.tanggal && item.tanggal.startsWith(filterBulan));
    }
    if (filterBbm) {
        filteredData = filteredData.filter(item => item.bbm === filterBbm);
    }
    if (filterKendaraan) {
        filteredData = filteredData.filter(item => item.plat && item.plat.toUpperCase().includes(filterKendaraan));
    }

    filteredData.sort((a, b) => {
        if (sortBy === 'tanggal-asc') return new Date(a.tanggal) - new Date(b.tanggal);
        if (sortBy === 'tanggal-desc') return new Date(b.tanggal) - new Date(a.tanggal);
        if (sortBy === 'bbm-asc') return (a.bbm || '').localeCompare(b.bbm || '');
        if (sortBy === 'bbm-desc') return (b.bbm || '').localeCompare(a.bbm || '');
        if (sortBy === 'plat-asc') return (a.plat || '').localeCompare(b.plat || '');
        if (sortBy === 'plat-desc') return (b.plat || '').localeCompare(a.plat || '');
        if (sortBy === 'harga-asc') return a.total - b.total;
        if (sortBy === 'harga-desc') return b.total - a.total;
        return 0;
    });

    tbody.innerHTML = '';
    let totalHarga = 0;

    filteredData.forEach((item) => {
        totalHarga += item.total;
        const badgeClass = BADGE_CLASS_MAP[item.bbm] || 'badge-default';

        let tombolFotoHtml = `<span style="color:#94a3b8; font-size:12px;">Tanpa Foto</span>`;

        if (item.fotoUrl && String(item.fotoUrl).startsWith("http")) {
            tombolFotoHtml = `<a href="${item.fotoUrl}" target="_blank" class="btn-view-photo" style="text-decoration:none; display:inline-block;">🔗 Buka Foto Drive</a>`;
        } else if (item.foto && String(item.foto).startsWith("data:image")) {
            const originalIndex = databaseNota.indexOf(item);
            tombolFotoHtml = `<button class="btn-view-photo" onclick="bukaModalFoto(${originalIndex})">👁️ Lihat Foto</button>`;
        }

        tbody.innerHTML += `
            <tr>
                <td class="txt-transaksi">${item.no}</td>
                <td>${item.tanggal}</td>
                <td><span class="badge ${badgeClass}">${item.bbm}</span></td>
                <td>${item.plat}</td>
                <td class="text-right" style="font-weight:600">Rp${item.total.toLocaleString('id-ID')}</td>
                <td class="text-center">${tombolFotoHtml}</td>
            </tr>
        `;
    });

    const summaryTotalNota = document.getElementById('summaryTotalNota');
    const summaryTotalHarga = document.getElementById('summaryTotalHarga');
    if (summaryTotalNota) summaryTotalNota.innerText = filteredData.length;
    if (summaryTotalHarga) summaryTotalHarga.innerText = `Rp${totalHarga.toLocaleString('id-ID')}`;
}
