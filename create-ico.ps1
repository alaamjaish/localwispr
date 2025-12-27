Add-Type -AssemblyName System.Drawing

# Create a 256x256 bitmap for the icon
$sizes = @(16, 32, 48, 256)
$bitmaps = @()

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(139, 92, 246))
    $g.SmoothingMode = 'AntiAlias'
    $brush = [System.Drawing.Brushes]::White
    $fontSize = [int]($size * 0.5)
    if ($fontSize -lt 8) { $fontSize = 8 }
    $font = New-Object System.Drawing.Font('Arial', $fontSize, [System.Drawing.FontStyle]::Bold)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = 'Center'
    $sf.LineAlignment = 'Center'
    $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $g.DrawString('W', $font, $brush, $rect, $sf)
    $g.Dispose()
    $bitmaps += $bmp
}

# Save the largest one as icon.ico (simplified - just save as png and copy)
$bitmaps[3].Save('src-tauri/icons/icon.ico', [System.Drawing.Imaging.ImageFormat]::Png)

# Clean up
foreach ($bmp in $bitmaps) {
    $bmp.Dispose()
}

Write-Host 'ICO file created!'
