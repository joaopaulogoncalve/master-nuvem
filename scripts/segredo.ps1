# Grava um segredo no Worker (ex.: RESEND_API_KEY, MP_ACCESS_TOKEN) sem mostrar o valor.
# Rodar:  powershell -ExecutionPolicy Bypass -File scripts\segredo.ps1 -Nome RESEND_API_KEY
# O valor é pedido numa janelinha do Windows (campo Senha) e vai direto para a Cloudflare.
param([Parameter(Mandatory = $true)][ValidatePattern("^[A-Z0-9_]+$")][string]$Nome)

$cred = Get-Credential -UserName $Nome -Message "Cole o valor de $Nome no campo Senha e clique OK"
if ($cred -eq $null) { Write-Host "Cancelado." -ForegroundColor Red; exit 1 }
$valor = $cred.GetNetworkCredential().Password.Trim()
if ($valor.Length -lt 8) { Write-Host "Valor vazio ou curto demais. Nada foi alterado." -ForegroundColor Red; exit 1 }
# Chave do Resend sempre começa com "re_" e não tem espaço (copiar com espaço ou cortada dá "Malformed access token").
if ($Nome -eq "RESEND_API_KEY" -and $valor -notmatch '^re_[A-Za-z0-9_]{20,}$') { Write-Host "Isso não parece uma chave do Resend (começa com re_). Copie de novo pelo botão de copiar. Nada foi alterado." -ForegroundColor Red; exit 1 }

$valor | npx.cmd --yes wrangler secret put $Nome
if ($LASTEXITCODE -ne 0) { Write-Host "Falhou ao gravar $Nome." -ForegroundColor Red; exit 1 }
Write-Host "Pronto! $Nome gravado na Cloudflare." -ForegroundColor Green
