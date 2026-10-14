# 用 ImageMagick 把 png 转换成多尺寸 icon.ico
# assets 目录在其上一级目录中。

$assetDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'assets'
New-Item -ItemType Directory -Path $assetDir -Force | Out-Null

$pngPath = Join-Path $assetDir 'icon.png'
$icoPath = Join-Path $assetDir 'icon.ico'

# 检查源 png 是否存在
if (-not (Test-Path $pngPath)) {
    Write-Error "找不到源文件: $pngPath，请先把 icon.png 放到 assets 目录下。"
    exit 1
}

# 检查 magick 命令是否可用
$magickCmd = Get-Command magick -ErrorAction SilentlyContinue
if (-not $magickCmd) {
    Write-Error "未找到 magick 命令，请确认 ImageMagick 已安装并加入 PATH。"
    exit 1
}

# 生成多尺寸 ico（256/128/64/48/32/16），保留完整颜色与透明通道
& magick $pngPath -define icon:auto-resize=256,128,64,48,32,16 $icoPath

if ($LASTEXITCODE -eq 0) {
    Write-Host "icon.ico 已生成: $icoPath"
} else {
    Write-Error "ico 生成失败，magick 退出码: $LASTEXITCODE"
    exit $LASTEXITCODE
}