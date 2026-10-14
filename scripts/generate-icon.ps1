Add-Type -AssemblyName System.Drawing
$assetDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'assets'
New-Item -ItemType Directory -Path $assetDir -Force | Out-Null
$bitmap = New-Object System.Drawing.Bitmap 256, 256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)
$green = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 167, 229, 171))
$dark = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 25, 44, 32))
$light = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 235, 255, 235))
$graphics.FillEllipse($green, 12, 12, 232, 232)
$graphics.FillEllipse($dark, 52, 76, 152, 124)
$graphics.FillEllipse($light, 90, 126, 17, 22)
$graphics.FillEllipse($light, 149, 126, 17, 22)
$graphics.FillEllipse($green, 120, 158, 16, 10)
$bitmap.Save((Join-Path $assetDir 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$iconHandle = $bitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($iconHandle)
$stream = [System.IO.File]::Create((Join-Path $assetDir 'icon.ico'))
$icon.Save($stream)
$stream.Close()
$icon.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
$green.Dispose()
$dark.Dispose()
$light.Dispose()
