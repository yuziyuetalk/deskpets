param([int]$ExcludeProcessId = 0)
$source = @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class DeskPetForeground {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct MONITORINFO {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
    }
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd, StringBuilder name, int maxCount);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);

    public static bool IsFullscreen(uint excludedProcessId) {
        IntPtr hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero) return false;
        uint processId;
        GetWindowThreadProcessId(hwnd, out processId);
        if (processId == excludedProcessId) return false;
        var name = new StringBuilder(128);
        GetClassName(hwnd, name, name.Capacity);
        string cls = name.ToString();
        if (cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd") return false;
        RECT rect;
        if (!GetWindowRect(hwnd, out rect)) return false;
        IntPtr monitor = MonitorFromWindow(hwnd, 2);
        if (monitor == IntPtr.Zero) return false;
        MONITORINFO info = new MONITORINFO();
        info.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
        if (!GetMonitorInfo(monitor, ref info)) return false;
        return rect.Left <= info.rcMonitor.Left + 2 && rect.Top <= info.rcMonitor.Top + 2
            && rect.Right >= info.rcMonitor.Right - 2 && rect.Bottom >= info.rcMonitor.Bottom - 2;
    }
}
'@
try {
    Add-Type -TypeDefinition $source -ErrorAction Stop
    $previous = ''
    while ($true) {
        $current = if ([DeskPetForeground]::IsFullscreen([uint32]$ExcludeProcessId)) { 'FULLSCREEN 1' } else { 'FULLSCREEN 0' }
        if ($current -ne $previous) { [Console]::Out.WriteLine($current); [Console]::Out.Flush(); $previous = $current }
        Start-Sleep -Milliseconds 1500
    }
} catch {
    [Console]::Error.WriteLine($_)
    exit 1
}
