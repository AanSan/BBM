/**
 * ====================================================================
 * GOOGLE APPS SCRIPT — KPPD BANTUL BBM MANAGEMENT
 * - Saldo Awal: Sheet "SALDO" (A1:D6)
 * - Pembelian : Sheet "PEMBELIAN" (A3:C...)
 * - Intransit  : Sheet "Catatan Pengeluaran BBM"
 * - Terpakai   : Sheet "Nota BBM"
 * ====================================================================
 */

const SHEET_NOTA = "Nota BBM";
const SHEET_PERMOHONAN = "Catatan Pengeluaran BBM";
const SHEET_SALDO = "SALDO";
const SHEET_PEMBELIAN = "PEMBELIAN";
const FOLDER_NAME = "Foto Nota BBM";
const WHISPER_API_KEY = PropertiesService.getScriptProperties().getProperty("WHISPER_API_KEY") || "uf3mDFBoCCQNyVhE0XrJPQ_exEH5zlPTXIVGSMCGNjM";
const WHISPER_BASE_URL = "https://llmwhisperer-api.us-central.unstract.com/api/v2";

function createJsonResponse(data) {
    return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
}

function getNominalPerKupon(namaBbm) {
    var str = String(namaBbm || '').toUpperCase();
    if (str.indexOf("100.000") !== -1) return 100000;
    if (str.indexOf("200.000") !== -1) return 200000;
    if (str.indexOf("20.000") !== -1) return 20000;
    if (str.indexOf("DEX") !== -1 || str.indexOf("DEXLITE") !== -1) return 200000;
    return 20000;
}

// 1. READ DATA DARI SPREADSHEET (doGet)
function doGet(e) {
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();

        // A. Data Nota BBM (Terpakai)
        var sheetNota = ss.getSheetByName(SHEET_NOTA) || ss.getSheets()[0];
        var dataNota = sheetNota.getDataRange().getValues();
        var richTextNota = sheetNota.getDataRange().getRichTextValues();
        var listNota = [];

        if (dataNota.length > 1) {
            for (var i = 1; i < dataNota.length; i++) {
                var row = dataNota[i];
                if (!row.some(function (c) { return c !== "" && c !== null; })) continue;

                var tglRaw = row[1];
                var namaBbm = String(row[2] || '').trim();
                var kuponRaw = Number(row[3]);
                var platRaw = String(row[5] || '').toUpperCase().trim();
                var noTransRaw = String(row[6] || '').trim();

                var nominalKupon = getNominalPerKupon(namaBbm);
                var jumlahKupon = (kuponRaw && !isNaN(kuponRaw) && kuponRaw > 0) ? kuponRaw : 1;

                var urlFoto = "";
                if (richTextNota[i] && richTextNota[i][4]) {
                    urlFoto = richTextNota[i][4].getLinkUrl() || "";
                }
                if (!urlFoto && String(row[4] || '').indexOf("http") !== -1) {
                    urlFoto = String(row[4]).trim();
                }

                listNota.push({
                    no: noTransRaw || ("NOTA-" + i),
                    tanggal: formatTanggal(tglRaw),
                    bbm: namaBbm || "PERTAMAX 200.000",
                    plat: platRaw || "KANTOR",
                    total: nominalKupon * jumlahKupon,
                    kupon: jumlahKupon,
                    pemohon: String(row[7] || ''),
                    fotoUrl: urlFoto
                });
            }
        }

        // B. Data Intransit
        var sheetPermohonan = ss.getSheetByName(SHEET_PERMOHONAN);
        var listIntransit = [];

        if (sheetPermohonan) {
            var dataPermohonan = sheetPermohonan.getDataRange().getValues();
            if (dataPermohonan.length > 1) {
                for (var j = 1; j < dataPermohonan.length; j++) {
                    var r = dataPermohonan[j];
                    if (!r.some(function (c) { return c !== "" && c !== null; })) continue;

                    var isKembali = r[6] === true || String(r[6]).toUpperCase() === "TRUE";

                    if (!isKembali) {
                        listIntransit.push({
                            id: "ROW-" + (j + 1),
                            tanggal: formatTanggal(r[1]),
                            bbm: String(r[2] || '').trim(),
                            kupon: Number(r[3]) || 1,
                            plat: String(r[4] || '').trim(),
                            pemohon: String(r[5] || '').trim(),
                            status: "PENDING"
                        });
                    }
                }
            }
        }

        // C. Data Saldo Awal
        var sheetSaldo = ss.getSheetByName(SHEET_SALDO);
        var listSaldoAwal = [];

        if (sheetSaldo) {
            var dataSaldo = sheetSaldo.getDataRange().getValues();
            for (var k = 2; k <= 5; k++) {
                if (dataSaldo[k] && dataSaldo[k][0]) {
                    listSaldoAwal.push({
                        barang: String(dataSaldo[k][0]).trim(),
                        harga: dataSaldo[k][1],
                        kupon: Number(dataSaldo[k][2]) || 0,
                        jumlah: Number(dataSaldo[k][3]) || 0
                    });
                }
            }
        }

        // D. Data Pembelian
        var sheetPembelian = ss.getSheetByName(SHEET_PEMBELIAN);
        var listPembelian = [];

        if (sheetPembelian) {
            var dataPembelian = sheetPembelian.getDataRange().getValues();
            if (dataPembelian.length > 2) {
                for (var p = 2; p < dataPembelian.length; p++) {
                    var pRow = dataPembelian[p];
                    var namaBarangBeli = String(pRow[0] || '').trim();
                    var kuponBeli = Number(pRow[1]);

                    if (namaBarangBeli !== "" && !isNaN(kuponBeli) && kuponBeli > 0) {
                        listPembelian.push({
                            barang: namaBarangBeli,
                            kupon: kuponBeli,
                            bulan: String(pRow[2] || '').trim(),
                            nominalPerKupon: getNominalPerKupon(namaBarangBeli)
                        });
                    }
                }
            }
        }

        return createJsonResponse({
            status: "success",
            nota: listNota,
            intransit: listIntransit,
            saldoAwal: listSaldoAwal,
            pembelian: listPembelian
        });

    } catch (err) {
        return createJsonResponse({ status: "error", message: err.message });
    }
}

// 2. WRITE DATA KE SPREADSHEET (doPost)
function doPost(e) {
    try {
        var data = JSON.parse(e.postData.contents);
        var ss = SpreadsheetApp.getActiveSpreadsheet();

        if (data.action === "ocr") {
            return createJsonResponse(processOCR(data.foto));
        }

        if (data.action === "pemohon_ambil") {
            var sheetP = ss.getSheetByName(SHEET_PERMOHONAN);
            if (!sheetP) sheetP = ss.createSheet(SHEET_PERMOHONAN);

            sheetP.appendRow([
                new Date(),
                data.tanggal,
                data.bbm,
                data.kupon,
                data.plat,
                data.pemohon,
                false,
                "Intransit App"
            ]);
            return createJsonResponse({ status: "success", message: "Kupon berhasil diserahkan ke pemohon." });
        }

        if (data.action === "kembalikan_kupon") {
            var sheetP = ss.getSheetByName(SHEET_PERMOHONAN);
            if (sheetP && data.idPinjam && data.idPinjam.indexOf("ROW-") !== -1) {
                var rowIndex = parseInt(data.idPinjam.replace("ROW-", ""), 10);
                var kuponPinjamAwal = Number(sheetP.getRange(rowIndex, 4).getValue()) || 0;
                var jumlahRetur = Number(data.jumlahKembali) || 0;

                if (kuponPinjamAwal > jumlahRetur && jumlahRetur > 0) {
                    var sisaIntransit = kuponPinjamAwal - jumlahRetur;
                    sheetP.getRange(rowIndex, 4).setValue(sisaIntransit);
                    sheetP.getRange(rowIndex, 8).setValue("Dikembalikan Sebagian (" + jumlahRetur + " lbr): " + (data.alasan || ""));
                } else {
                    sheetP.getRange(rowIndex, 7).setValue(true);
                    sheetP.getRange(rowIndex, 8).setValue("Dikembalikan Seluruhnya: " + (data.alasan || ""));
                }
            }
            return createJsonResponse({ status: "success", message: "Status permohonan retur berhasil diperbarui." });
        }

        if (data.action === "pembelian_baru") {
            var sheetBeli = ss.getSheetByName(SHEET_PEMBELIAN);
            if (!sheetBeli) sheetBeli = ss.createSheet(SHEET_PEMBELIAN);

            sheetBeli.appendRow([
                data.bbm,
                data.jumlahKupon,
                data.bulan
            ]);
            return createJsonResponse({ status: "success", message: "Pasokan kupon berhasil dicatat ke sheet PEMBELIAN." });
        }

        // Action Simpan Nota SPBU
        var sheetN = ss.getSheetByName(SHEET_NOTA) || ss.getSheets()[0];
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

        sheetN.appendRow([
            new Date(),
            data.tanggal,
            data.bbm,
            jumlahKupon,
            linkFotoNota,
            data.plat,
            data.no,
            data.pemohon || ''
        ]);

        if (data.idPinjam && data.idPinjam.indexOf("ROW-") !== -1) {
            var sheetP = ss.getSheetByName(SHEET_PERMOHONAN);
            if (sheetP) {
                var rIdx = parseInt(data.idPinjam.replace("ROW-", ""), 10);
                var kuponAwal = Number(sheetP.getRange(rIdx, 4).getValue()) || 0;
                var kuponDipakai = jumlahKupon;

                if (kuponAwal > kuponDipakai) {
                    var sisaKupon = kuponAwal - kuponDipakai;
                    sheetP.getRange(rIdx, 4).setValue(sisaKupon);
                    sheetP.getRange(rIdx, 8).setValue("Terpakai sebagian: " + kuponDipakai + " lbr (Nota " + data.no + ")");

                    sheetP.appendRow([
                        new Date(),
                        data.tanggal,
                        data.bbm,
                        kuponDipakai,
                        data.plat,
                        data.pemohon,
                        true,
                        "LPJ Parsial Nota " + data.no
                    ]);
                } else {
                    sheetP.getRange(rIdx, 7).setValue(true);
                    sheetP.getRange(rIdx, 8).setValue("Selesai LPJ Nota " + data.no);
                }
            }
        }

        return createJsonResponse({ status: "success", photoUrl: linkFotoNota, kupon: jumlahKupon });

    } catch (err) {
        return createJsonResponse({ status: "error", message: err.message });
    }
}

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

        var response = UrlFetchApp.fetch(WHISPER_BASE_URL + "/whisper?mode=high_quality&output_mode=layout_preserving", options);
        var jsonResponse = JSON.parse(response.getContentText());

        if (!jsonResponse.whisper_hash) {
            throw new Error("Gagal OCR: " + response.getContentText());
        }

        var encodedHash = encodeURIComponent(jsonResponse.whisper_hash);
        var statusOptions = { method: "get", headers: { "unstract-key": WHISPER_API_KEY }, muteHttpExceptions: true };

        for (var i = 0; i < 15; i++) {
            Utilities.sleep(2000);
            var statusResp = UrlFetchApp.fetch(WHISPER_BASE_URL + "/whisper-status?whisper_hash=" + encodedHash, statusOptions);
            var statusData = JSON.parse(statusResp.getContentText());

            if (statusData.status === "processed") {
                var retrieveResp = UrlFetchApp.fetch(WHISPER_BASE_URL + "/whisper-retrieve?whisper_hash=" + encodedHash, statusOptions);
                var retrieveData = JSON.parse(retrieveResp.getContentText());
                return { status: "success", text: retrieveData.result_text };
            } else if (statusData.status === "failed") {
                throw new Error("Proses OCR gagal di server.");
            }
        }
        throw new Error("Timeout OCR.");
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