Add-Type -AssemblyName System.Drawing

# Create a proper .ico file with multiple sizes
$iconSizes = @(16, 32, 48, 256)
$iconPath = "src-tauri/icons/icon.ico"

# Create bitmaps for each size
$images = @()
foreach ($size in $iconSizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.InterpolationMode = 'HighQualityBicubic'

    # Blue background
    $g.Clear([System.Drawing.Color]::FromArgb(37, 99, 235))

    # White "W" text
    $brush = [System.Drawing.Brushes]::White
    $fontSize = [math]::Max(8, [int]($size * 0.5))
    $font = New-Object System.Drawing.Font('Arial', $fontSize, [System.Drawing.FontStyle]::Bold)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = 'Center'
    $sf.LineAlignment = 'Center'
    $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $g.DrawString('W', $font, $brush, $rect, $sf)
    $g.Dispose()

    $images += $bmp
}

# Save as ICO using proper method
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)

# ICO header
$bw.Write([Int16]0)      # Reserved
$bw.Write([Int16]1)      # Type (1 = ICO)
$bw.Write([Int16]$images.Count)  # Number of images

# Calculate offsets
$headerSize = 6 + (16 * $images.Count)
$offset = $headerSize
$imageData = @()

foreach ($img in $images) {
    $imgMs = New-Object System.IO.MemoryStream
    $img.Save($imgMs, [System.Drawing.Imaging.ImageFormat]::Png)
    $data = $imgMs.ToArray()
    $imageData += ,@($data)

    $width = if ($img.Width -eq 256) { 0 } else { $img.Width }
    $height = if ($img.Height -eq 256) { 0 } else { $img.Height }

    # Directory entry
    $bw.Write([byte]$width)
    $bw.Write([byte]$height)
    $bw.Write([byte]0)    # Color palette
    $bw.Write([byte]0)    # Reserved
    $bw.Write([Int16]1)   # Color planes
    $bw.Write([Int16]32)  # Bits per pixel
    $bw.Write([Int32]$data.Length)
    $bw.Write([Int32]$offset)

    $offset += $data.Length
    $imgMs.Dispose()
}

# Write image data
foreach ($data in $imageData) {
    $bw.Write($data)
}

# Save to file
[System.IO.File]::WriteAllBytes($iconPath, $ms.ToArray())

$bw.Dispose()
$ms.Dispose()
foreach ($img in $images) {
    $img.Dispose()
}

Write-Host "Proper ICO file created at $iconPath"
