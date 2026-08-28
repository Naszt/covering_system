$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$defaultCompiler = 'C:\Users\Naszt\.cache\codex-emsdk\upstream\emscripten\em++.exe'
$compiler = if ($env:EMXX) { $env:EMXX } elseif (Test-Path -LiteralPath $defaultCompiler) { $defaultCompiler } else { 'em++' }
$source = Join-Path $PSScriptRoot 'parser_wasm.cpp'
$output = Join-Path $projectRoot 'tree\covering-parser.mjs'
$compat = Join-Path $PSScriptRoot 'compat'

& $compiler $source `
  -std=c++20 `
  -O3 `
  -I $compat `
  --bind `
  -sMODULARIZE=1 `
  -sEXPORT_ES6=1 `
  -sENVIRONMENT=web `
  -sALLOW_MEMORY_GROWTH=1 `
  -sFILESYSTEM=0 `
  -sSINGLE_FILE=1 `
  -sASSERTIONS=0 `
  -o $output

if ($LASTEXITCODE -ne 0) { throw "Emscripten 编译失败，退出码 $LASTEXITCODE" }
Write-Output "generated $output"
