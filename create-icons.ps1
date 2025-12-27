Add-Type -AssemblyName System.Drawing

function Create-Icon {
    param([int]$size, [string]$path)

    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(139, 92, 246))
    $g.SmoothingMode = 'AntiAlias'
    $brush = [System.Drawing.Brushes]::White
    $fontSize = [int]($size * 0.5)
    $font = New-Object System.Drawing.Font('Arial', $fontSize, [System.Drawing.FontStyle]::Bold)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = 'Center'
    $sf.LineAlignment = 'Center'
    $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $g.DrawString('W', $font, $brush, $rect, $sf)
    $g.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Created: $path"
}

Create-Icon -size 32 -path 'src-tauri/icons/32x32.png'
Create-Icon -size 128 -path 'src-tauri/icons/128x128.png'
Create-Icon -size 256 -path 'src-tauri/icons/128x128@2x.png'
Create-Icon -size 256 -path 'src-tauri/icons/icon.png'

Write-Host 'All icons created successfully!'
