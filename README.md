# ATLAS

I wanted a Stream Deck but didn't want to pay $150 for one, so I built one out of my phone instead.

ATLAS is a small server that runs on your PC and turns your phone into a remote for it — launch apps, control your system, see what's playing, grab files, all from your pocket. No cloud, no account, no subscription. Your phone just talks straight to your PC over your own network (or [Tailscale](https://tailscale.com) if you're out of the house).

**v0.1, still very much a work in progress.** This is the tool I actually use every day, cleaned up enough to hand to other people. It's rough in places and there's a lot I still want to add. If it's useful to you, fork it, break it, bolt stuff onto it — I'll keep updating as I go, and PRs/issues are welcome.

## What it does

- **Deck** — a grid of one-tap app launchers, with a live green/gray dot showing whether each app is actually running
- **Scenes** — one button that fires a sequence of app launches + system controls in order (e.g. "Focus Mode" opens your browser and notes, "Wind Down" mutes and turns off the screen)
- **Controls** — sleep, screen off, volume, brightness — real system-level control, not just a link to Settings
- **Now Playing** — see and control whatever's playing on your PC (any app that reports to Windows media controls) from your phone, including in Wuthering Waves/Discord/YouTube-in-browser scenarios
- **Send** — drop a photo or file from your phone straight onto your desktop, no more emailing things to yourself
- **Clipboard bridge** — push text from your phone into your PC's clipboard, or pull your PC's clipboard to your phone
- **Files** — browse and download from Desktop/Downloads/Documents/Pictures on your PC from your phone
- **Home dashboard** — CPU/GPU/RAM health ring with live sparklines, per-drive storage bars, and a real activity log of what ATLAS has done
- **Settings page** — add, edit, and remove apps and scenes from a form in the browser. No JSON editing required.

Everything above is configured per-install — a fresh clone starts with an empty deck and walks you through adding your own apps.

## Quick start

Requires **Windows** and **Node.js**.

```bash
git clone https://github.com/tensedbomsie/self-hosted-atlas.git
cd self-hosted-atlas
npm install
npm start
```

The server prints a URL with a token baked in, e.g.:

```
ATLAS running on port 3131
Token: a1b2c3d4e5f6...
Open on your phone (same WiFi/hotspot):
  http://192.168.1.42:3131/?token=a1b2c3d4e5f6...
```

Open that URL on your phone (same Wi-Fi/hotspot as your PC), then use your browser's "Add to Home Screen" to install it as an app icon. From there, go to the **Settings** page and add your first shortcuts — no config files to hand-edit.

Don't want to be tied to the same network? Skip ahead to [Remote access](#remote-access-optional) — Tailscale gets you a URL that works from anywhere.

### Remote access (optional)

Want to control your PC from outside your home network? Run ATLAS behind [Tailscale](https://tailscale.com):

```bash
tailscale serve --bg 3131
```

This gives you an HTTPS URL reachable from any device on your own tailnet — never the public internet. **Do not enable Tailscale Funnel** — that exposes the server publicly, and ATLAS's token auth is not designed to withstand that.

### Keep it running (optional)

`npm start` is fine for trying it out, but it dies the moment you close the terminal, and it won't survive your PC sleeping/waking or a crash. To have it start on login and auto-restart itself if it ever dies:

1. Drop `start-hidden.vbs` into your Windows Startup folder (`Win+R` → `shell:startup`)
2. It launches `supervisor.bat`, which runs ATLAS in a loop — if `node` ever dies for any reason, it's back up within 2 seconds

### Media control & CPU temp (optional)

- Media controls (Now Playing) work out of the box via Windows' built-in media session API.
- CPU temperature on the Home dashboard needs [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) running with its "Remote Web Server" option enabled (Options menu). Without it, the temperature card just won't appear — everything else works fine.
- Brightness +/- needs [brightctrl](https://github.com/shahriyardx/brightctrl) (`winget install shahriyardx.brightctrl`) for external monitors over DDC/CI. Without it, those two buttons will just fail — everything else works fine.

## Why not just use KDE Connect / X thing

Stuff like KDE Connect already does pieces of this (clipboard, notifications), but it's tied to specific desktop environments and doesn't do app launching or a system dashboard. I wanted all of it in one place, running on Windows, without installing a bunch of separate tools — so I just built the thing.

## Tech stack

- **Server:** Node.js + Express, plain PowerShell scripts for Windows-specific actions (no extra services required beyond Node)
- **Client:** vanilla HTML/CSS/JS, installable as a PWA — no build step
- **Auth:** a random token generated on first run, required on every request
- **Security:** path-traversal-safe file browsing (requests are confined to the configured root folders), no external network calls

## Known limitations

- Windows only (uses PowerShell + Win32 APIs for system control)
- LAN-only by default — remote access requires Tailscale (see above)
- CPU temperature requires LibreHardwareMonitor running separately (optional)

## License

MIT
