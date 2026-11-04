# Cria a senha compartilhada LUCRO_TOKEN e grava IGUAL nos dois Workers (master-nuvem e china-em-casa), sem mostrar na tela.
# Com ela, o admin do China em Casa lê os totais da Master Nuvem em /api/integracao/lucro (só leitura, só números).
# Rodar (na pasta master-nuvem):  powershell -ExecutionPolicy Bypass -File scripts\token-lucro.ps1
# Rodar de novo troca a senha nos dois de uma vez (use se achar que vazou).
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$token = -join ($bytes | ForEach-Object { $_.ToString("x2") })

$token | npx.cmd --yes wrangler secret put LUCRO_TOKEN
if ($LASTEXITCODE -ne 0) { Write-Host "Falhou ao gravar no master-nuvem. Nada foi trocado no china-em-casa." -ForegroundColor Red; exit 1 }
$token | npx.cmd --yes wrangler secret put LUCRO_TOKEN --name china-em-casa
if ($LASTEXITCODE -ne 0) { Write-Host "Gravou no master-nuvem, mas falhou no china-em-casa. Rode de novo." -ForegroundColor Red; exit 1 }
$token = $null
Write-Host "Pronto! LUCRO_TOKEN gravado igual no master-nuvem e no china-em-casa." -ForegroundColor Green
