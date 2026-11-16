$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$output = Join-Path $root 'src-tauri/macos'
$productName = (Get-Content (Join-Path $root 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json).productName
$icon = [System.Drawing.Image]::FromFile((Join-Path $root 'src-tauri/icons/icon.png'))
$font = [System.Drawing.Font]::new('Segoe UI Semibold', 34, [System.Drawing.GraphicsUnit]::Pixel)
$ink = [System.Drawing.ColorTranslator]::FromHtml('#23211f')
$paper = [System.Drawing.ColorTranslator]::FromHtml('#f5f1ea')
$copper = [System.Drawing.ColorTranslator]::FromHtml('#9d4e32')
$header = [System.Drawing.SolidBrush]::new($ink)
$wordmark = [System.Drawing.SolidBrush]::new($paper)
$arrow = [System.Drawing.Pen]::new($copper, 2.5)
$arrow.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$arrow.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$arrow.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$plate = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#faf8f4'))
$border = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#e0d7ca'))
New-Item -ItemType Directory -Path $output -ErrorAction SilentlyContinue | Out-Null

function New-IconPlate($left) {
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddArc($left, 161, 16, 16, 180, 90)
    $path.AddArc($left + 124, 161, 16, 16, 270, 90)
    $path.AddArc($left + 124, 281, 16, 16, 0, 90)
    $path.AddArc($left, 281, 16, 16, 90, 90)
    $path.CloseFigure()
    return $path
}

try {
    # Finder coordinates and window size are defined in build-macos-dmg.py.
    foreach ($scale in 1, 2) {
        $bitmap = [System.Drawing.Bitmap]::new(640 * $scale, 350 * $scale)
        $bitmap.SetResolution(72 * $scale, 72 * $scale)
        $canvas = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $canvas.ScaleTransform($scale, $scale)
            $canvas.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $canvas.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $canvas.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
            $canvas.Clear($paper)
            $canvas.FillRectangle($header, 0, 0, 640, 116)
            $canvas.DrawImage($icon, 246, 34, 48, 48)
            $canvas.DrawString($productName, $font, $wordmark, 303, 32)

            foreach ($left in 115, 385) {
                $pad = New-IconPlate $left
                try {
                    $canvas.FillPath($plate, $pad)
                    $canvas.DrawPath($border, $pad)
                } finally {
                    $pad.Dispose()
                }
            }

            $canvas.DrawLine($arrow, 286, 225, 349, 225)
            $canvas.DrawLines($arrow, [System.Drawing.PointF[]]@(
                [System.Drawing.PointF]::new(339, 215),
                [System.Drawing.PointF]::new(349, 225),
                [System.Drawing.PointF]::new(339, 235)
            ))

            $name = if ($scale -eq 1) { 'installer-background.png' } else { 'installer-background@2x.png' }
            $bitmap.Save((Join-Path $output $name), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally {
            $canvas.Dispose()
            $bitmap.Dispose()
        }
    }
} finally {
    foreach ($resource in $icon, $font, $header, $wordmark, $arrow, $plate, $border) {
        $resource.Dispose()
    }
}
