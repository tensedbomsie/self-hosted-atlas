param([string]$Action)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class KeyboardSim {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
public class DisplayControl {
    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
}
"@

$KEYEVENTF_EXTENDEDKEY = 0x1
$KEYEVENTF_KEYUP = 0x2
$VK_VOLUME_MUTE = 0xAD
$VK_VOLUME_DOWN = 0xAE
$VK_VOLUME_UP = 0xAF

$HWND_BROADCAST = [IntPtr]0xffff
$WM_SYSCOMMAND = 0x0112
$SC_MONITORPOWER = [IntPtr]0xF170

$BRIGHTCTL = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\shahriyardx.brightctrl_Microsoft.Winget.Source_8wekyb3d8bbwe\brightctrl.exe"

function Send-Key($vk) {
    [KeyboardSim]::keybd_event($vk, 0, $KEYEVENTF_EXTENDEDKEY, [UIntPtr]::Zero)
    [KeyboardSim]::keybd_event($vk, 0, ($KEYEVENTF_EXTENDEDKEY -bor $KEYEVENTF_KEYUP), [UIntPtr]::Zero)
}

switch ($Action) {
    "sleep"       { rundll32.exe powrprof.dll,SetSuspendState 0,1,0 }
    "volume-up"   { Send-Key $VK_VOLUME_UP }
    "volume-down" { Send-Key $VK_VOLUME_DOWN }
    "mute"        { Send-Key $VK_VOLUME_MUTE }
    "screen-off"  { [DisplayControl]::PostMessage($HWND_BROADCAST, $WM_SYSCOMMAND, $SC_MONITORPOWER, [IntPtr]2) }
    "brightness-up"   { & $BRIGHTCTL set all +10 }
    "brightness-down" { & $BRIGHTCTL set all -10 }
    default       { Write-Error "unknown action"; exit 1 }
}
