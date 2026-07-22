/**
 * ====================================================================
 * GOOGLE APPS SCRIPT — Sistem Backend Rekonsiliasi Nota BBM (Fixed)
 * Fitur: OCR Data Sync, Auto-Upload Drive, Format Tanggal & Rupiah
 * ====================================================================
 */

const SHEET_NAME = "Nota BBM";
const FOLDER_NAME = "Foto Nota BBM";

/**
 * Helper response JSON yang aman dari CORS
 */
function createJsonResponse(data) {
    return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
}
/**
 * Fungsi untuk memproses OCR dari base64 menggunakan LLM Whisperer
 */
function processOCR(base64Image) {
    const API_KEY = "uf3mDFBoCCQNyVhE0XrJPQ_exEH5zlPTXIVGSMCGNjM";
    const BASE_URL = "https://llmwhisperer-api.us-central.unstract.com/api/v2";

    try {
        var base64Data = base64Image.split(",")[1] || base64Image;
        var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), "image/jpeg");

        // 1. Submit Image ke LLM Whisperer
        var options = {
            method: "post",
            contentType: "application/octet-stream",
            headers: { "unstract-key": API_KEY },
            payload: blob.getBytes(),
            muteHttpExceptions: true
        };

        var response = UrlFetchApp.fetch(BASE_URL + "/whisper?mode=high_quality&output_mode=layout_preserving", options);
        var jsonResponse = JSON.parse(response.getContentText());

        if (!jsonResponse.whisper_hash) {
            throw new Error("Gagal mendapatkan whisper_hash: " + response.getContentText());
        }

        var whisperHash = jsonResponse.whisper_hash;

        // 2. Polling Status hingga selesai
        var statusOptions = {
            method: "get",
            headers: { "unstract-key": API_KEY },
            muteHttpExceptions: true
        };

        for (var i = 0; i < 10; i++) { // Coba max 10x
            Utilities.sleep(2000); // Tunggu 2 detik tiap perulangan

            var statusResp = UrlFetchApp.fetch(BASE_URL + "/whisper-status?whisper_hash=" + whisperHash, statusOptions);
            var statusData = JSON.parse(statusResp.getContentText());

            if (statusData.status === "processed") {
                // 3. Ambil Hasil OCR
                var retrieveResp = UrlFetchApp.fetch(BASE_URL + "/whisper-retrieve?whisper_hash=" + whisperHash, statusOptions);
                var retrieveData = JSON.parse(retrieveResp.getContentText());
                return { status: "success", text: retrieveData.result_text };
            } else if (statusData.status === "failed") {
                throw new Error("Proses ekstraksi OCR di server gagal.");
            }
        }

        throw new Error("Waktu tunggu OCR habis (Timeout).");

    } catch (err) {
        return { status: "error", message: err.message };
    }
}
/**
 * 1. HANDLE GET REQUEST (Membaca data & mengekstrak URL dari Hyperlink/Smart Chip)
 */
function doGet(e) {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
        if (!sheet) {
            return createJsonResponse({ status: "error", message: "Sheet '" + SHEET_NAME + "' tidak ditemukan!" });
        }

        var range = sheet.getDataRange();
        var data = range.getValues();            // Nilai teks biasa
        var richText = range.getRichTextValues(); // Objek RichText untuk hyperlink
        var result = [];

        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            // Lewati baris kosong jika tidak ada baris tanggal/no transaksi
            if (!row[1] && !row[6]) continue;

            var namaBarang = String(row[2] || '').trim();
            var bbm = namaBarang;
            var harga = 0;
            var jumlahKupon = Number(row[3]) || 1;

            // Parser Jenis BBM & Harga dari kolom Nama Barang (misal: "PERTAMAX 150.000")
            if (namaBarang.includes("SPBU PIRAMID") || namaBarang.includes("PIRAMID")) {
                bbm = "PERTAMAX 100.000 (SPBU PIRAMID)";
                harga = 100000;
            } else {
                var match = namaBarang.match(/^(.+?)\s+([\d.]+)/);
                if (match) {
                    bbm = match[1].trim();
                    harga = parseInt(match[2].replace(/\./g, ''), 10) || 0;
                }
            }

            // --- EKSTRAK LINK FOTO (KOLOM E / INDEX 4) ---
            var urlFoto = "";
            var richTextCell = (richText[i] && richText[i][4]) ? richText[i][4] : null;

            if (richTextCell) {
                urlFoto = richTextCell.getLinkUrl() || "";
            }

            if (!urlFoto) {
                var plainText = String(row[4] || '').trim();
                if (plainText.indexOf("http") !== -1) {
                    urlFoto = plainText;
                }
            }

            var noTransaksi = String(row[6] || '').trim();

            result.push({
                no: noTransaksi,
                tanggal: formatTanggal(row[1]),
                bbm: bbm,
                plat: String(row[5] || '').toUpperCase(),
                total: harga * jumlahKupon,
                fotoUrl: urlFoto
            });
        }

        return createJsonResponse(result);

    } catch (err) {
        return createJsonResponse({ status: "error", message: err.message });
    }
}

/**
 * 2. HANDLE POST REQUEST (Menulis data baru dari Web App ke Spreadsheet & Drive)
 */
// Tambahkan penanganan action 'ocr' pada doPost
function doPost(e) {
    try {
        var data = {};
        if (e.postData && e.postData.contents) {
            data = JSON.parse(e.postData.contents);
        } else if (e.parameter) {
            data = e.parameter;
        }

        // Jika request khusus untuk OCR
        if (data.action === "ocr") {
            var ocrResult = processOCR(data.foto);
            return ContentService.createTextOutput(JSON.stringify(ocrResult))
                .setMimeType(ContentService.MimeType.JSON);
        }

        // --- SISA KODE SIMPAN SPREADSHEET SAMA SEPERTI SEBELUMNYA ---
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
        if (!sheet) return createJsonResponse({ status: "error", message: "Sheet tidak ditemukan!" });

        var hargaFormatted = formatRupiah(data.total);
        var namaBarang = (data.bbm || '') + " " + hargaFormatted;
        var linkFotoNota = "";

        if (data.foto && data.foto.indexOf("data:image") !== -1) {
            var folders = DriveApp.getFoldersByName(FOLDER_NAME);
            var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(FOLDER_NAME);
            var mimeTypeMatch = data.foto.match(/^data:(image\/\w+);base64,/);
            var mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/jpeg";
            var base64Data = data.foto.split(",")[1];

            var blob = Utilities.newBlob(
                Utilities.base64Decode(base64Data),
                mimeType,
                "Nota_" + (data.no || "BBM") + "_" + (data.tanggal || "TGL") + ".jpg"
            );

            var file = folder.createFile(blob);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            linkFotoNota = file.getUrl();
        }

        sheet.appendRow(['', data.tanggal, namaBarang, 1, linkFotoNota, data.plat, data.no]);
        return createJsonResponse({ status: "success", photoUrl: linkFotoNota });

    } catch (err) {
        return createJsonResponse({ status: "error", message: err.message });
    }
}

/**
 * 3. HELPER FUNCTIONS
 */

function formatTanggal(value) {
    if (!value) return "";

    if (value instanceof Date) {
        var y = value.getFullYear();
        var m = String(value.getMonth() + 1).padStart(2, '0');
        var d = String(value.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    }

    var strValue = String(value).trim();
    var parts = strValue.split(/[-/]/);
    if (parts.length === 3) {
        if (parts[0].length === 4) { // Format YYYY-MM-DD
            return parts[0] + '-' + parts[1].padStart(2, '0') + '-' + parts[2].padStart(2, '0');
        }
        if (parts[2].length === 4) { // Format DD-MM-YYYY
            return parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0');
        }
    }

    return strValue;
}

function formatRupiah(num) {
    if (!num) return "0";
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}