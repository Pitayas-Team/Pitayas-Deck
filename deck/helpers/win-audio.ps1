# Pitaya Deck — sterowanie dźwiękiem na Windowsie (Core Audio: IAudioEndpointVolume i sesje aplikacji)
# Działa w tle i czyta polecenia z wejścia, jedno w linii; odpowiada jedną linią JSON:
#   get master | get mic                          → {"volume":45,"muted":false}
#   set master 0.45 | set mic 0.8                 → {"ok":true}
#   mute master toggle|on|off | mute mic …        → {"ok":true}
#   list                                          → {"apps":[{"name":"Spotify","pid":123,"volume":80,"muted":false}]}
#   set app <nazwa> 0.5 | mute app <nazwa> toggle → {"ok":true}
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
    int f(); int g(); int h(); int i();
    int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
    int j();
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int k(); int l(); int m(); int n();
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
    int GetMute(out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
    int Activate(ref Guid id, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    int f();
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }

[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 {
    int f(); int g();
    int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum);
}
[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator {
    int GetCount(out int SessionCount);
    int GetSession(int SessionCount, [MarshalAs(UnmanagedType.IUnknown)] out object Session);
}
[Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2 {
    int f(); int g(); int h(); int i(); int j(); int k(); int l(); int m(); int n();
    int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int GetProcessId(out uint pRetVal);
    int IsSystemSoundsSession();
}
[Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISimpleAudioVolume {
    int SetMasterVolume(float fLevel, ref Guid EventContext);
    int GetMasterVolume(out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid EventContext);
    int GetMute(out bool pbMute);
}

public class PdSession { public uint Pid; public float Volume; public bool Muted; public object Ctl; }

public static class PdAudio {
    static IMMDevice Device(int flow) {
        var en = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
        IMMDevice dev = null;
        Marshal.ThrowExceptionForHR(en.GetDefaultAudioEndpoint(flow, 1, out dev));
        return dev;
    }
    static IAudioEndpointVolume Endpoint(int flow) {
        object o; var iid = typeof(IAudioEndpointVolume).GUID;
        Marshal.ThrowExceptionForHR(Device(flow).Activate(ref iid, 23, IntPtr.Zero, out o));
        return (IAudioEndpointVolume)o;
    }
    // flow: 0 = wyjście (render), 1 = wejście (capture)
    public static float GetVolume(int flow) { float v; Marshal.ThrowExceptionForHR(Endpoint(flow).GetMasterVolumeLevelScalar(out v)); return v; }
    public static void SetVolume(int flow, float v) { Marshal.ThrowExceptionForHR(Endpoint(flow).SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(1f, v)), Guid.Empty)); }
    public static bool GetMute(int flow) { bool m; Marshal.ThrowExceptionForHR(Endpoint(flow).GetMute(out m)); return m; }
    public static void SetMute(int flow, bool m) { Marshal.ThrowExceptionForHR(Endpoint(flow).SetMute(m, Guid.Empty)); }
    public static List<PdSession> Sessions() {
        var list = new List<PdSession>();
        object o; var iid = typeof(IAudioSessionManager2).GUID;
        Marshal.ThrowExceptionForHR(Device(0).Activate(ref iid, 23, IntPtr.Zero, out o));
        var mgr = (IAudioSessionManager2)o;
        IAudioSessionEnumerator en;
        Marshal.ThrowExceptionForHR(mgr.GetSessionEnumerator(out en));
        int n; en.GetCount(out n);
        for (int i = 0; i < n; i++) {
            object s; if (en.GetSession(i, out s) != 0 || s == null) continue;
            var c2 = s as IAudioSessionControl2; var vol = s as ISimpleAudioVolume;
            if (c2 == null || vol == null) continue;
            uint pid; c2.GetProcessId(out pid);
            if (pid == 0) continue;   // dźwięki systemowe
            float v; bool m; vol.GetMasterVolume(out v); vol.GetMute(out m);
            list.Add(new PdSession { Pid = pid, Volume = v, Muted = m, Ctl = s });
        }
        return list;
    }
    public static void SetSession(object ctl, float v) { var g = Guid.Empty; ((ISimpleAudioVolume)ctl).SetMasterVolume(Math.Max(0f, Math.Min(1f, v)), ref g); }
    public static void MuteSession(object ctl, bool m) { var g = Guid.Empty; ((ISimpleAudioVolume)ctl).SetMute(m, ref g); }
}
'@

function ProcName($procId) {
    try { $p = Get-Process -Id $procId -ErrorAction Stop; if ($p.MainWindowTitle -and $p.Description) { return $p.Description } ; if ($p.Description) { return $p.Description }; return $p.ProcessName } catch { return "PID $procId" }
}
function Apps() {
    $out = @()
    foreach ($s in [PdAudio]::Sessions()) {
        $name = ''
        try { $name = (Get-Process -Id $s.Pid -ErrorAction Stop).ProcessName } catch { $name = "pid$($s.Pid)" }
        $out += [pscustomobject]@{ name = $name; label = (ProcName $s.Pid); pid = $s.Pid; volume = [math]::Round($s.Volume * 100); muted = $s.Muted; ctl = $s.Ctl }
    }
    return $out
}
function Flow($w) { if ($w -eq 'mic') { 1 } else { 0 } }
function Reply($obj) { [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 4)); [Console]::Out.Flush() }

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($line -eq $null) { break }
    $a = $line.Trim() -split ' ', 4
    try {
        switch ($a[0]) {
            'ping' { Reply @{ ok = $true } }
            'get' { $f = Flow $a[1]; Reply @{ volume = [math]::Round([PdAudio]::GetVolume($f) * 100); muted = [PdAudio]::GetMute($f) } }
            'set' {
                if ($a[1] -eq 'app') {
                    $hit = @(Apps | Where-Object { $_.name -ieq $a[2] })
                    if (-not $hit.Count) { throw "Aplikacja $($a[2]) nie ma teraz sesji dźwięku" }
                    foreach ($h in $hit) { [PdAudio]::SetSession($h.ctl, [float]::Parse($a[3], [Globalization.CultureInfo]::InvariantCulture)) }
                } else { [PdAudio]::SetVolume((Flow $a[1]), [float]::Parse($a[2], [Globalization.CultureInfo]::InvariantCulture)) }
                Reply @{ ok = $true }
            }
            'mute' {
                if ($a[1] -eq 'app') {
                    $hit = @(Apps | Where-Object { $_.name -ieq $a[2] })
                    if (-not $hit.Count) { throw "Aplikacja $($a[2]) nie ma teraz sesji dźwięku" }
                    $to = if ($a[3] -eq 'toggle') { -not $hit[0].muted } else { $a[3] -eq 'on' }
                    foreach ($h in $hit) { [PdAudio]::MuteSession($h.ctl, $to) }
                } else {
                    $f = Flow $a[1]
                    $to = if ($a[2] -eq 'toggle') { -not [PdAudio]::GetMute($f) } else { $a[2] -eq 'on' }
                    [PdAudio]::SetMute($f, $to)
                }
                Reply @{ ok = $true }
            }
            'list' {
                $seen = @{}; $apps = @()
                foreach ($x in Apps) { if (-not $seen.ContainsKey($x.name)) { $seen[$x.name] = 1; $apps += @{ name = $x.name; label = $x.label; procId = $x.pid; volume = $x.volume; muted = $x.muted } } }
                Reply @{ apps = @($apps) }
            }
            default { Reply @{ error = "Nieznane polecenie: $($a[0])" } }
        }
    } catch { Reply @{ error = $_.Exception.Message } }
}
