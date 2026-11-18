Set-Location $PSScriptRoot
npx.cmd --yes wrangler@4 pages deploy modelos --project-name rezende-modelos --branch main --commit-dirty=true
