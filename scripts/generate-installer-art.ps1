Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$productName = (Get-Content (Join-Path $root 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json).productName
$output = Join-Path $root 'src-tauri/windows'
$icon = [System.Drawing.Image]::FromFile((Join-Path $root 'src-tauri/icons/icon.png'))
New-Item -ItemType Directory -Path $output -ErrorAction SilentlyContinue | Out-Null

function Save-InstallerBitmap($name, $width, $height, $paint) {
    $scale = 4
    $large = [System.Drawing.Bitmap]::new($width * $scale, $height * $scale)
    $graphics = [System.Drawing.Graphics]::FromImage($large)
    $graphics.ScaleTransform($scale, $scale)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    & $paint $graphics
    $graphics.Dispose()

    # NSIS expects ordinary 24-bit BMP files.
    $result = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $resizer = [System.Drawing.Graphics]::FromImage($result)
    $resizer.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $resizer.DrawImage($large, 0, 0, $width, $height)
    $resizer.Dispose()
    $result.Save((Join-Path $output $name), [System.Drawing.Imaging.ImageFormat]::Bmp)
    $result.Dispose()
    $large.Dispose()
}

Save-InstallerBitmap 'installer-sidebar.bmp' 164 314 {
    param($g)
    $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#23211f'))
    $g.DrawImage($icon, 25, 30, 52, 52)
    $font = [System.Drawing.Font]::new('Segoe UI', 19, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $brush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#f5f1ea'))
    $g.DrawString($productName, $font, $brush, 22, 98)
    $brush.Dispose()
    $font.Dispose()
}

Save-InstallerBitmap 'installer-header.bmp' 150 57 {
    param($g)
    $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#f5f1ea'))
    $g.DrawImage($icon, 100, 9, 39, 39)
}

$icon.Dispose()

