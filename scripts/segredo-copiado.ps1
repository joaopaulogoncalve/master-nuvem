# Grava um segredo LONGO (ex.: WHATSAPP_TOKEN da Meta, que passa de 256 letras) direto do que foi copiado (Ctrl+C).
# A janelinha do segredo.ps1 corta textos longos; este script lê a área de transferência, grava na Cloudflare
# e limpa a área de transferência. O valor nunca aparece na tela.
# Rodar:  powershell -ExecutionPolicy Bypass -File scripts\segredo-copiado.ps1 -Nome WHATSAPP_TOKEN
param([Parameter(Mandatory = $true)][ValidatePattern("^[A-Z0-9_]+$")][string]$Nome)

Set-Location (Split-Path $PSScriptRoot -Parent)
Add-Type -AssemblyName System.Windows.Forms
$valor = ([System.Windows.Forms.Clipboard]::GetText()).Trim()
if ($valor.Length -lt 20) { Write-Host "Nada copiado (ou curto demais). Copie o valor (botão de copiar) e rode de novo. Nada foi alterado." -ForegroundColor Red; exit 1 }
if ($valor -match '\s') { Write-Host "O texto copiado tem espaço ou quebra de linha: não parece um token. Copie de novo pelo botão de copiar. Nada foi alterado." -ForegroundColor Red; exit 1 }
if ($Nome -eq "WHATSAPP_TOKEN" -and $valor -notmatch '^EAA') { Write-Host "Isso não parece um token da Meta (começa com EAA). Copie de novo. Nada foi alterado." -ForegroundColor Red; exit 1 }

Write-Host ("Gravando $Nome (" + $valor.Length + " letras)...")
$valor | npx.cmd --yes wrangler secret put $Nome
$ok = $LASTEXITCODE -eq 0
[System.Windows.Forms.Clipboard]::Clear()
if (-not $ok) { Write-Host "Falhou ao gravar $Nome." -ForegroundColor Red; exit 1 }
Write-Host "Pronto! $Nome gravado na Cloudflare (e a área de transferência foi limpa)." -ForegroundColor Green
