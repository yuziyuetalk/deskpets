param([Parameter(Mandatory = $true)][string]$Path)

$source = @'
using System;
using System.Runtime.InteropServices;
public static class DeskPetWallpaper {
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool SystemParametersInfo(uint action, uint param, string value, uint flags);
}
'@
try {
    Add-Type -TypeDefinition $source -ErrorAction Stop
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw 'Image file does not exist.' }
    if (-not [DeskPetWallpaper]::SystemParametersInfo(20, 0, $Path, 3)) { throw 'Windows rejected the wallpaper.' }
    Write-Output 'OK'
} catch {
    Write-Error $_
    exit 1
}
