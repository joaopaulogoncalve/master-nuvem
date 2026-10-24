# Configura o CORS do bucket master-nuvem-cliente (envio e download pelo navegador).
# A tela do Backblaze só libera download; o envio (PUT) precisa desta regra personalizada.
# Rodar:  powershell -ExecutionPolicy Bypass -File scripts\b2-cors.ps1 [-KeyId 005...]
# A chave é pedida na hora (numa janelinha do Windows) e NÃO fica salva em lugar nenhum.
param([string]$KeyId = "")

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$bucketId = "3b6a94f247d90aefa6110a1c"
$origens = @(
  "https://masternuvem.com.br",
  "https://www.masternuvem.com.br",
  "https://master-nuvem.paulojao151.workers.dev"
)

if ($KeyId -eq "") { $KeyId = Read-Host "Cole o keyID da chave do Backblaze (comeca com 005)" }
$keyId = $KeyId.Trim()
if ($keyId.StartsWith("K")) {
  Write-Host "Isso parece a applicationKey (a parte secreta), nao o keyID. Apague essa chave no Backblaze, crie outra e rode de novo." -ForegroundColor Red
  exit 1
}
Write-Host "Abrindo uma janelinha do Windows: cole a applicationKey (comeca com K005) no campo Senha e clique OK."
$cred = Get-Credential -UserName $keyId -Message "Cole a applicationKey do Backblaze (comeca com K005) no campo Senha"
if ($cred -eq $null) { Write-Host "Cancelado." -ForegroundColor Red; exit 1 }
$seguro = $cred.Password
$chave = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro))
$basico = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($keyId + ":" + $chave))

try {
  $auth = Invoke-RestMethod -Uri "https://api.backblazeb2.com/b2api/v3/b2_authorize_account" -Headers @{ Authorization = "Basic " + $basico }
} catch {
  Write-Host "Nao consegui entrar no Backblaze. Confira o keyID e a applicationKey." -ForegroundColor Red
  Write-Host ("Resposta do Backblaze: " + $_.ErrorDetails.Message + " " + $_.Exception.Message)
  Write-Host ("Tamanho da applicationKey colada: " + $chave.Length + " caracteres (o normal e 31).")
  exit 1
}

$corpo = @{
  accountId = $auth.accountId
  bucketId  = $bucketId
  corsRules = @(
    @{
      corsRuleName      = "masterNuvemSite"
      allowedOrigins    = $origens
      allowedOperations = @("s3_put", "s3_get", "s3_head")
      allowedHeaders    = @("*")
      maxAgeSeconds     = 3600
    }
  )
} | ConvertTo-Json -Depth 5

try {
  $r = Invoke-RestMethod -Method Post -Uri ($auth.apiInfo.storageApi.apiUrl + "/b2api/v3/b2_update_bucket") `
    -Headers @{ Authorization = $auth.authorizationToken } -ContentType "application/json" -Body $corpo
  # Confere lendo de volta o que ficou gravado no bucket
  $lista = Invoke-RestMethod -Method Post -Uri ($auth.apiInfo.storageApi.apiUrl + "/b2api/v3/b2_list_buckets") `
    -Headers @{ Authorization = $auth.authorizationToken } -ContentType "application/json" `
    -Body (@{ accountId = $auth.accountId; bucketId = $bucketId } | ConvertTo-Json)
  $gravado = $lista.buckets[0].corsRules
  $ops = ($gravado | ForEach-Object { $_.allowedOperations }) -join ", "
  if ($ops -match "s3_put") {
    Write-Host "Pronto! CORS gravado no bucket $($lista.buckets[0].bucketName). Operacoes: $ops" -ForegroundColor Green
  } else {
    Write-Host "ATENCAO: o Backblaze respondeu, mas o envio (s3_put) NAO ficou gravado. Operacoes: $ops" -ForegroundColor Yellow
  }
  $gravado | ConvertTo-Json -Depth 5
} catch {
  Write-Host "O Backblaze recusou a alteracao:" -ForegroundColor Red
  Write-Host $_.ErrorDetails.Message
  Write-Host "Confira se a chave tem permissao 'Read and Write' para todos os buckets."
  exit 1
}
