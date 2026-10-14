param([Parameter(Mandatory = $true)][string]$Handle)

$source = @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class DeskPetDesktop {
    public delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lparam);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lparam);
    [DllImport("user32.dll")] public static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr child);
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hwnd, uint command);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr hwnd, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] public static extern IntPtr SetWindowLongPtr(IntPtr hwnd, int index, IntPtr value);
    [DllImport("user32.dll")] public static extern bool SetLayeredWindowAttributes(IntPtr hwnd, uint key, byte alpha, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, IntPtr wparam, IntPtr lparam, uint flags, uint timeout, out IntPtr result);

    public static bool Attach(IntPtr child) {
        IntPtr progman = FindWindow("Progman", null);
        if (progman == IntPtr.Zero) return false;
        IntPtr result;
        SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, 0, 1000, out result);
        IntPtr directIcons = FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
        if (directIcons != IntPtr.Zero) {
            // On current Windows 11, Progman does not redirect its own pixels,
            // so an Electron child is invisible even when above DefView.
            // Keep a top-level, click-through layered window immediately above
            // Progman and below normal application windows.
            RECT rect;
            if (!GetWindowRect(child, out rect)) return false;
            if (GetParent(child) != IntPtr.Zero) SetParent(child, IntPtr.Zero);
            long topStyle = GetWindowLongPtr(child, -16).ToInt64();
            topStyle = (topStyle | 0x80000000L) & ~0x40000000L;
            SetWindowLongPtr(child, -16, new IntPtr(topStyle));
            IntPtr aboveProgman = GetWindow(progman, 3); // GW_HWNDPREV
            if (aboveProgman == child) return true; // already directly above Progman
            return SetWindowPos(child, aboveProgman, rect.Left, rect.Top,
                rect.Right - rect.Left, rect.Bottom - rect.Top,
                0x0010 | 0x0020 | 0x0040); // SWP_NOACTIVATE | FRAMECHANGED | SHOWWINDOW
        }
        IntPtr parent = IntPtr.Zero;
        IntPtr insertAfter = new IntPtr(1); // HWND_BOTTOM
        {
            EnumWindows((top, _) => {
                if (FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero) {
                    IntPtr worker = FindWindowEx(IntPtr.Zero, top, "WorkerW", null);
                    if (worker != IntPtr.Zero) { parent = worker; return false; }
                }
                return true;
            }, IntPtr.Zero);
            if (parent == IntPtr.Zero) {
                EnumWindows((top, _) => {
                    if (FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero) {
                        parent = top; return false;
                    }
                    return true;
                }, IntPtr.Zero);
            }
        }
        if (parent == IntPtr.Zero) return false;
        if (GetParent(child) == parent) {
            return SetWindowPos(child, insertAfter, 0, 0, 0, 0,
                0x0001 | 0x0002 | 0x0010 | 0x0040); // SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_SHOWWINDOW
        }
        RECT childRect, parentRect;
        if (!GetWindowRect(child, out childRect) || !GetWindowRect(parent, out parentRect)) return false;
        long style = GetWindowLongPtr(child, -16).ToInt64();
        style = (style | 0x40000000L) & ~0x80000000L; // WS_CHILD, remove WS_POPUP
        SetWindowLongPtr(child, -16, new IntPtr(style));
        long exStyle = GetWindowLongPtr(child, -20).ToInt64();
        if ((exStyle & 0x00080000L) == 0) {
            SetWindowLongPtr(child, -20, new IntPtr(exStyle | 0x00080000L)); // WS_EX_LAYERED
            if (!SetLayeredWindowAttributes(child, 0, 255, 0x02)) return false;
        }
        SetParent(child, parent);
        return SetWindowPos(child, insertAfter,
            childRect.Left - parentRect.Left, childRect.Top - parentRect.Top,
            childRect.Right - childRect.Left, childRect.Bottom - childRect.Top,
            0x0010 | 0x0020 | 0x0040); // SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW
    }
}
'@

try {
    Add-Type -TypeDefinition $source -ErrorAction Stop
    $hwnd = [IntPtr]::new([Int64]::Parse($Handle))
    if ([DeskPetDesktop]::Attach($hwnd)) { Write-Output 'ATTACHED'; exit 0 }
    Write-Error 'Could not find a usable desktop layer.'
    exit 1
} catch {
    Write-Error $_
    exit 1
}
