param(
  [Parameter(Mandatory = $true)]
  [string]$SourcePath,
  [Parameter(Mandatory = $true)]
  [string]$DestinationPath
)

Add-Type -AssemblyName System.Drawing

$source = [System.Drawing.Bitmap]::new($SourcePath)
$output = [System.Drawing.Bitmap]::new($source.Width, $source.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($output)
$graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
$graphics.DrawImageUnscaled($source, 0, 0)

$transparent = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::Transparent)
$graphics.FillRectangle($transparent, 0, 0, $output.Width, 90)
$graphics.FillRectangle($transparent, 0, 1405, $output.Width, $output.Height - 1405)
$graphics.FillRectangle($transparent, 0, 0, 55, $output.Height)
$graphics.FillRectangle($transparent, 1040, 0, $output.Width - 1040, $output.Height)

$destinationDirectory = Split-Path -Parent $DestinationPath
New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
$output.Save($DestinationPath, [System.Drawing.Imaging.ImageFormat]::Png)

$transparent.Dispose()
$graphics.Dispose()
$output.Dispose()
$source.Dispose()
