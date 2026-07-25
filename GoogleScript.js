/**
 * ====================================================================
 * GOOGLE APPS SCRIPT — Auto-Fix Universal Reader
 * ====================================================================
 */

const SHEET_NAME = "Nota BBM";
const FOLDER_NAME = "Foto Nota BBM";
const WHISPER_API_KEY = "uf3mDFBoCCQNyVhE0XrJPQ_exEH5zlPTXIVGSMCGNjM";
const WHISPER_BASE_URL = "https://llmwhisperer-api.us-central.unstract.com/api/v2";

function createJsonResponse(data) {
    return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
}

function getNominalPerKupon(namaBbm) {
    var str = String(namaBbm || '');
    if (str.indexOf("100.000") !== -1) return 100000;
    if (str.indexOf("200.000") !== -1) return 200000;
    if (str.indexOf("20.000") !== -1) return 20000;

    // Trik fallback jika nama BBM adalah teks lama (misal "PERTAMAX 150000")
    var match = str.match(/\d[\d\.]+/);
    if (match) {
        var num = parseInt(match[0].replace(/\./g, ''), 10);
        if (num > 0) return num;
    }
    return 20000;
}

function doGet(e) {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
        if (!sheet) {
            // Jika sheet nama 'Nota BBM' tidak ada, ambil sheet pertama
            sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
        }

        var range = sheet.getDataRange();
        var data = range.getValues();
        var richText = range.getRichTextValues();
        var result = [];

        if (data.length <= 1) {
            return createJsonResponse(result); // Memang belum ada data di sheet
        }

        for (var i = 1; i < data.length; i++) {
            var row = data[i];

            // Pengecekan agar tidak melewati baris yang berisi data
            var hasData = row.some(function (cell) { return cell !== "" && cell !== null; });
            if (!hasData) continue;

            var tglRaw = row[1];
            var namaBbm = String(row[2] || '').trim();
            var kuponRaw = Number(row[3]);
            var platRaw = String(row[5] || '').toUpperCase().trim();
            var noTransRaw = String(row[6] || '').trim();

            var nominalKupon = getNominalPerKupon(namaBbm);
            var jumlahKupon = (kuponRaw && !isNaN(kuponRaw) && kuponRaw > 0) ? kuponRaw : 1;
            var totalHarga = nominalKupon * jumlahKupon;

            // Ambil URL Foto dari Hyperlink atau Teks Biasa
            var urlFoto = "";
            if (richText[i] && richText[i][4]) {
                urlFoto = richText[i][4].getLinkUrl() || "";
            }
            if (!urlFoto && String(row[4] || '').indexOf("http") !== -1) {
                urlFoto = String(row[4]).trim();
            }

            result.push({
                no: noTransRaw || ("NOTA-" + i),
                tanggal: formatTanggal(tglRaw),
                bbm: namaBbm || "PERTAMAX 200.000",
                plat: platRaw || "KANTOR",
                total: totalHarga,
                kupon: jumlahKupon,
                fotoUrl: urlFoto
            });
        }

        return createJsonResponse(result);
    } catch (err) {
        return createJsonResponse({ status: "error", message: err.message });
    }
}

function doPost(e) {
    try {
        var data = {};
        if (e.postData && e.postData.contents) {
            data = JSON.parse(e.postData.contents);
        } else if (e.parameter) {
            data = e.parameter;
        }

        if (data.action === "ocr") {
            var ocrResult = processOCR(data.foto);
            return createJsonResponse(ocrResult);
        }

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
        if (!sheet) sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

        var totalHarga = Number(data.total) || 0;
        var nominalKupon = getNominalPerKupon(data.bbm);
        var jumlahKupon = Math.floor(totalHarga / nominalKupon) || 1;

        var linkFotoNota = "";
        if (data.foto && data.foto.indexOf("data:image") !== -1) {
            var folders = DriveApp.getFoldersByName(FOLDER_NAME);
            var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(FOLDER_NAME);
            var base64Data = data.foto.split(",")[1];
            var blob = Utilities.newBlob(
                Utilities.base64Decode(base64Data),
                "image/jpeg",
                "Nota_" + (data.no || "BBM") + "_" + (data.tanggal || "TGL") + ".jpg"
            );
            var file = folder.createFile(blob);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            linkFotoNota = file.getUrl();
        }

        sheet.appendRow(['', data.tanggal, data.bbm, jumlahKupon, linkFotoNota, data.plat, data.no]);
        return createJsonResponse({ status: "success", photoUrl: linkFotoNota, kupon: jumlahKupon });

    } catch (err) {
        return createJsonResponse({ status: "error", message: err.message });
    }
}

/**
 * Memproses OCR via LLM Whisperer API (Fixed URL Encoding)
 */
function processOCR(base64Image) {
    try {
        var base64Data = base64Image.split(",")[1] || base64Image;
        var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), "image/jpeg");

        var options = {
            method: "post",
            contentType: "application/octet-stream",
            headers: { "unstract-key": WHISPER_API_KEY },
            payload: blob.getBytes(),
            muteHttpExceptions: true
        };

        // 1. Submit Gambar ke API
        var response = UrlFetchApp.fetch(WHISPER_BASE_URL + "/whisper?mode=high_quality&output_mode=layout_preserving", options);
        var jsonResponse = JSON.parse(response.getContentText());

        if (!jsonResponse.whisper_hash) {
            throw new Error("Gagal mendapatkan whisper_hash: " + response.getContentText());
        }

        var whisperHash = jsonResponse.whisper_hash;

        // PERBAIKAN: Safe Encode Hash agar karakter '|' atau spesial tidak merusak URL Request
        var encodedHash = encodeURIComponent(whisperHash);

        var statusOptions = {
            method: "get",
            headers: { "unstract-key": WHISPER_API_KEY },
            muteHttpExceptions: true
        };

        // 2. Polling Status
        for (var i = 0; i < 15; i++) {
            Utilities.sleep(2000); // Tunggu 2 detik tiap loop

            var statusUrl = WHISPER_BASE_URL + "/whisper-status?whisper_hash=" + encodedHash;
            var statusResp = UrlFetchApp.fetch(statusUrl, statusOptions);
            var statusData = JSON.parse(statusResp.getContentText());

            if (statusData.status === "processed") {
                // 3. Ambil Teks Hasil OCR
                var retrieveUrl = WHISPER_BASE_URL + "/whisper-retrieve?whisper_hash=" + encodedHash;
                var retrieveResp = UrlFetchApp.fetch(retrieveUrl, statusOptions);
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
        if (parts[0].length === 4) return parts[0] + '-' + parts[1].padStart(2, '0') + '-' + parts[2].padStart(2, '0');
        if (parts[2].length === 4) return parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0');
    }
    return strValue;
}