# Troca a chave do Backblaze que o site usa (segredos B2_KEY_ID e B2_APP_KEY do Worker).
# Rodar:  powershell -ExecutionPolicy Bypass -File scripts\b2-chave-site.ps1 -KeyId 005...
# A applicationKey é pedida numa janelinha do Windows, testada no Backblaze e
# enviada direto para a Cloudflare. Ela NÃO aparece na tela e NÃO fica salva.
param([Parameter(Mandatory = $true)][string]$KeyId)

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$KeyId = $KeyId.Trim()

$cred = Get-Credential -UserName $KeyId -Message "Cole a applicationKey do Backblaze (comeca com K005) no campo Senha"
if ($cred -eq $null) { Write-Host "Cancelado." -ForegroundColor Red; exit 1 }
$chave = $cred.GetNetworkCredential().Password.Trim()

# 1) Testa a chave no Backblaze antes de mexer no site
$basico = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($KeyId + ":" + $chave))
try {
  $auth = Invoke-RestMethod -Uri "https://api.backblazeb2.com/b2api/v3/b2_authorize_account" -Headers @{ Authorization = "Basic " + $basico }
} catch {
  Write-Host "O Backblaze recusou essa chave. Nada foi alterado no site." -ForegroundColor Red
  Write-Host ("Resposta: " + $_.ErrorDetails.Message)
  exit 1
}
$bucket = $auth.apiInfo.storageApi.bucketName
$caps = $auth.apiInfo.storageApi.capabilities -join ", "
Write-Host "Chave OK no Backblaze. Bucket: $bucket"
if ($caps -notmatch "writeFiles" -or $caps -notmatch "readFiles" -or $caps -notmatch "deleteFiles") {
  Write-Host "A chave precisa ser 'Read and Write'. Nada foi alterado no site." -ForegroundColor Red
  exit 1
}

# 2) Grava os dois segredos no Worker (a chave vai pela entrada padrão, sem aparecer)
$KeyId | npx.cmd --yes wrangler secret put B2_KEY_ID
if ($LASTEXITCODE -ne 0) { Write-Host "Falhou ao gravar B2_KEY_ID." -ForegroundColor Red; exit 1 }
$chave | npx.cmd --yes wrangler secret put B2_APP_KEY
if ($LASTEXITCODE -ne 0) { Write-Host "Falhou ao gravar B2_APP_KEY." -ForegroundColor Red; exit 1 }

Write-Host "Pronto! Chave do site trocada." -ForegroundColor Green
