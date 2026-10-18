param([string]$Python = '')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if (-not $Python) {
    $localVenv = Join-Path (Get-Location) '.venv/Scripts/python.exe'
    $bundled = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
    if (Test-Path -LiteralPath $localVenv) { $Python = $localVenv }
    elseif (Get-Command python -ErrorAction SilentlyContinue) { $Python = 'python' }
    elseif (Test-Path -LiteralPath $bundled) { $Python = $bundled }
    else { throw '需要 Python 3.10+，或使用 -Python 指定 Python 可执行文件。' }
}
& $Python -c 'import pypdf'
if ($LASTEXITCODE -ne 0) { throw '缺少 pypdf，请按 backend/README.md 安装 requirements.txt。' }
& $Python -m backend
exit $LASTEXITCODE
