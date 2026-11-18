# Publica o site FINAL da Rezende (pasta publico/) em rezendecredito.com.br
# Antes, se mexeu nos modelos: node montar-unido.js ; node montar-publico.js
Set-Location $PSScriptRoot
npx.cmd --yes wrangler@4 pages project create rezende-site --production-branch main 2>$null
npx.cmd --yes wrangler@4 pages deploy publico --project-name rezende-site --branch main --commit-dirty=true
