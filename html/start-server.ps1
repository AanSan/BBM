# BBM App - Local Server + Reverse Proxy ke LLM Whisperer
# Jalankan: powershell -ExecutionPolicy Bypass -File start-server.ps1
# Lalu buka http://localhost:8080 di browser

$port = 8080
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$llmBase = "https://llmwhisperer-api.us-central.unstract.com/api/v2"
$postmanPath = Join-Path $root "postman_collection.json"
if (Test-Path $postmanPath) {
    try {
        $postmanJson = Get-Content $postmanPath -Raw | ConvertFrom-Json
        $baseUrlVar = $postmanJson.variable | Where-Object { $_.key -eq "baseUrl" }
        if ($baseUrlVar -and $baseUrlVar.value) {
            $llmBase = $baseUrlVar.value
            Write-Host "Menggunakan baseUrl dari postman_collection.json: $llmBase" -ForegroundColor Green
        }
    } catch {
        Write-Host "Gagal membaca postman_collection.json, menggunakan default." -ForegroundColor Yellow
    }
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  BBM Server + LLM Whisperer Proxy" -ForegroundColor Green
Write-Host "  http://localhost:$port" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Buka link di atas di browser Anda."
Write-Host "Tekan Ctrl+C untuk menghentikan server."
Write-Host ""

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

function Send-Response($response, [int]$statusCode, [string]$contentType, [byte[]]$body) {
    $response.StatusCode = $statusCode
    $response.ContentType = $contentType
    $response.ContentLength64 = $body.Length
    $response.OutputStream.Write($body, 0, $body.Length)
    $response.OutputStream.Close()
}

function Send-TextResponse($response, [int]$statusCode, [string]$text) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
    Send-Response $response $statusCode "application/json; charset=utf-8" $bytes
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        $localPath = $request.Url.LocalPath

        # ============ API PROXY ROUTES ============
        if ($localPath -like "/api/*") {
            $apiKey = $request.Headers["unstract-key"]
            if (-not $apiKey) {
                Write-Host "[400] $localPath - Missing unstract-key header" -ForegroundColor Red
                Send-TextResponse $response 400 '{"error":"Missing unstract-key header"}'
                continue
            }

            try {
                if ($localPath -eq "/api/whisper" -and $request.HttpMethod -eq "POST") {
                    # --- POST /api/whisper -> Submit file untuk OCR ---
                    $query = $request.Url.Query
                    $targetUrl = "$llmBase/whisper$query"
                    Write-Host "[PROXY] POST $targetUrl" -ForegroundColor Magenta

                    # Baca body dari request
                    $ms = New-Object System.IO.MemoryStream
                    $request.InputStream.CopyTo($ms)
                    $bodyBytes = $ms.ToArray()
                    $ms.Close()

                    # Kirim ke LLM Whisperer
                    $webRequest = [System.Net.HttpWebRequest]::Create($targetUrl)
                    $webRequest.Method = "POST"
                    $webRequest.ContentType = "application/octet-stream"
                    $webRequest.Headers.Add("unstract-key", $apiKey)
                    $webRequest.ContentLength = $bodyBytes.Length
                    $webRequest.Timeout = 120000

                    $reqStream = $webRequest.GetRequestStream()
                    $reqStream.Write($bodyBytes, 0, $bodyBytes.Length)
                    $reqStream.Close()

                    $webResponse = $webRequest.GetResponse()
                    $reader = New-Object System.IO.StreamReader($webResponse.GetResponseStream())
                    $responseText = $reader.ReadToEnd()
                    $reader.Close()
                    $webResponse.Close()

                    Write-Host "[200] PROXY POST /api/whisper -> OK" -ForegroundColor Green
                    Send-TextResponse $response 200 $responseText

                } elseif ($localPath -eq "/api/whisper-status" -and $request.HttpMethod -eq "GET") {
                    # --- GET /api/whisper-status ---
                    $query = $request.Url.Query
                    $targetUrl = "$llmBase/whisper-status$query"
                    Write-Host "[PROXY] GET $targetUrl" -ForegroundColor Magenta

                    $webRequest = [System.Net.HttpWebRequest]::Create($targetUrl)
                    $webRequest.Method = "GET"
                    $webRequest.Headers.Add("unstract-key", $apiKey)
                    $webRequest.Timeout = 30000

                    $webResponse = $webRequest.GetResponse()
                    $reader = New-Object System.IO.StreamReader($webResponse.GetResponseStream())
                    $responseText = $reader.ReadToEnd()
                    $reader.Close()
                    $webResponse.Close()

                    Write-Host "[200] PROXY GET /api/whisper-status -> OK" -ForegroundColor Green
                    Send-TextResponse $response 200 $responseText

                } elseif ($localPath -eq "/api/whisper-retrieve" -and $request.HttpMethod -eq "GET") {
                    # --- GET /api/whisper-retrieve ---
                    $query = $request.Url.Query
                    $targetUrl = "$llmBase/whisper-retrieve$query"
                    Write-Host "[PROXY] GET $targetUrl" -ForegroundColor Magenta

                    $webRequest = [System.Net.HttpWebRequest]::Create($targetUrl)
                    $webRequest.Method = "GET"
                    $webRequest.Headers.Add("unstract-key", $apiKey)
                    $webRequest.Timeout = 30000

                    $webResponse = $webRequest.GetResponse()
                    $reader = New-Object System.IO.StreamReader($webResponse.GetResponseStream())
                    $responseText = $reader.ReadToEnd()
                    $reader.Close()
                    $webResponse.Close()

                    Write-Host "[200] PROXY GET /api/whisper-retrieve -> OK" -ForegroundColor Green
                    Send-TextResponse $response 200 $responseText

                } else {
                    Write-Host "[404] $localPath" -ForegroundColor Red
                    Send-TextResponse $response 404 '{"error":"API route not found"}'
                }
            } catch {
                $errMsg = $_.Exception.Message
                Write-Host "[ERR] PROXY $localPath -> $errMsg" -ForegroundColor Red
                
                # Coba baca response body dari WebException
                $errBody = '{"error":"' + ($errMsg -replace '"', '\"') + '"}'
                if ($_.Exception.InnerException -is [System.Net.WebException]) {
                    $webEx = $_.Exception.InnerException
                    if ($webEx.Response) {
                        $errReader = New-Object System.IO.StreamReader($webEx.Response.GetResponseStream())
                        $errBody = $errReader.ReadToEnd()
                        $errReader.Close()
                    }
                } elseif ($_.Exception -is [System.Net.WebException]) {
                    $webEx = $_.Exception
                    if ($webEx.Response) {
                        $errReader = New-Object System.IO.StreamReader($webEx.Response.GetResponseStream())
                        $errBody = $errReader.ReadToEnd()
                        $errReader.Close()
                    }
                }
                Send-TextResponse $response 502 $errBody
            }
            continue
        }

        # ============ STATIC FILE ROUTES ============
        if ($localPath -eq "/") { $localPath = "/index.html" }
        $filePath = Join-Path $root ($localPath.TrimStart("/").Replace("/", "\"))

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
            $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
            Send-Response $response 200 $contentType $fileBytes
            Write-Host "[200] $localPath" -ForegroundColor Green
        } else {
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            Send-Response $response 404 "text/plain" $msg
            Write-Host "[404] $localPath" -ForegroundColor Red
        }
    }
} finally {
    $listener.Stop()
    Write-Host "Server dihentikan." -ForegroundColor Yellow
}
