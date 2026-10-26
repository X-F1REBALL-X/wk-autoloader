<img src="docs/img/banner.png" alt="WK Autoloader Store">

Turns the PS5 Store tile into WK Autoloader: open the tile, start the jailbreak, and Elf Launcher opens when it finishes.

## Quick start

1. Send [`WK_Autoloader_Store_V1.2.0.elf`](https://github.com/X-F1REBALL-X/wk-autoloader/releases/download/v1.2.0/WK_Autoloader_Store_V1.2.0.elf) to elfldr on port `9021`.
2. Wait for the install to finish, then reboot.
3. Open the **Store** tile and press **Start Jailbreak**.

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Restore the PlayStation Store tile](#restore-the-playstation-store-tile)
- [What's new in 1.2.0](#whats-new-in-120)
- [Known issues](#known-issues)
- [Building from source](#building-from-source)
- [License](#license)
- [Credits](#credits)

## Features

- Replaces the Store tile on the home screen with WK Autoloader.
- Runs the Relapse jailbreak from the tile, then opens Elf Launcher by itself.
- Works offline after install. Send the ELF again only to reinstall or update.
- Each install clears the old WebKit cache first, so the cache is always filled from scratch.
- A separate Restore ELF puts the original PlayStation Store tile back.

## Requirements

- PS5 firmware 7.00–13.60 (Relapse).
- elfldr listening on port `9021`.
- A way to send an ELF to elfldr, for example after an earlier jailbreak.

## Installation

1. Send [`WK_Autoloader_Store_V1.2.0.elf`](https://github.com/X-F1REBALL-X/wk-autoloader/releases/download/v1.2.0/WK_Autoloader_Store_V1.2.0.elf) to elfldr on port `9021`.
2. Wait until the install finishes, then reboot the console.
3. Open the **Store** tile on the home screen.
4. Press **Start Jailbreak**. After Relapse completes, Elf Launcher opens automatically.

## Restore the PlayStation Store tile

Send [`WK_Autoloader_Store_Restore_V1.2.0.elf`](https://github.com/X-F1REBALL-X/wk-autoloader/releases/download/v1.2.0/WK_Autoloader_Store_Restore_V1.2.0.elf) to elfldr on port `9021`, then reboot. This also clears the WK cache.

## Optional: Store tile as a YouTube (Y2JB) launcher

This tree also contains a separate payload that does **not** use WebKit:

`WK_Store_YouTube_V1.0.0.elf` keeps the Store tile's stock name and art and
only rewrites its launch URI to the installed YouTube app's own deeplink
(`psgm:play?id=PPSA0165x`). Pressing **Store** then starts YouTube, where an
already-installed [Y2JB](https://github.com/itsPLK/ps5-y2jb-autoloader)
payload runs and loads elfldr.

Requirements:

- Y2JB already installed and working in the YouTube app.
- YouTube must be one of `PPSA01650` / `PPSA01651` / `PPSA01652`.
- elfldr on `9021` to send this one-time installer.

Install:

1. Send `WK_Store_YouTube_V1.0.0.elf` to elfldr on port `9021`.
2. Wait for **"Store tile now launches YouTube. Reboot."**
3. Reboot, then press the **Store** tile.

The payload backs up `app.db` / `appinfo.db` to
`/data/autojb-store-only-backup/` before writing, so
`WK_Autoloader_Store_Restore_V1.2.0.elf` restores the normal Store tile.
It does not install, update or modify Y2JB itself.

If the Store tile does not launch YouTube on your firmware, use the YouTube
tile directly; the tile deeplink is the only thing this payload changes.

## What's new in 1.2.0

Changes since 1.1.4.

- Install keeps the existing Store AppCache. No more automatic wipe.
- A backup is made before any cache clear (/data/wkal/appcache_backup/).
- Store Restore clears only the Store AppCache origin, nothing else.
- The installer waits for "Offline cache complete" before it finishes.
- When the firmware is unknown, the full manifest is used.
- Faster jailbreak: about 3.3s down to about 2.9s (quicker elfldr poll and faster ELF copy).
- Per-stage timing in ms, shown in the log and in Recent.

All versions are on the [releases page](https://github.com/X-F1REBALL-X/wk-autoloader/releases).

## Known issues

The first jailbreak right after installing the Store (or after a clean install or cache wipe) can occasionally freeze the console or cause a kernel panic. On that first run WebKit is still writing the Store's offline AppCache to disk while the exploit runs, and the extra disk and memory activity during its timing-sensitive phase can make it fail. Once the cache is fully written, later jailbreaks load from cache and are stable.

If it freezes, hold the power button to restart the console and run the jailbreak again; it usually works from the second run. To lower the risk, wait until the Store install has fully finished before your first jailbreak; the freeze is most likely while the AppCache is still being written right after install or after a cache wipe.

## Building from source

Needs the [PS5 payload SDK](https://github.com/ps5-payload-dev/sdk) with libmicrohttpd.

```bash
make store SDK=/path/to/ps5-payload-sdk BUILD_TYPE=stable
make restore SDK=/path/to/ps5-payload-sdk
make store-yt SDK=/path/to/ps5-payload-sdk
```

Outputs `WK_Autoloader_Store_V1.2.0.elf`, `WK_Autoloader_Store_Restore_V1.2.0.elf`
and `WK_Store_YouTube_V1.0.0.elf`. The `store-yt` target does not need
libmicrohttpd because it has no HTTP server or AppCache.

## License

[GNU GPL v3](LICENSE).

## Credits

- Relapse (PS5 WebKit / kernel chain, vendored under `frontend/autoloader/relapse/`)
- [ps5-elfldr](https://github.com/itsPLK/ps5-elfldr) by itsPLK
- [elf-launcher](https://github.com/X-F1REBALL-X/elf-launcher)
- SQLite (Store tile database remap)

Developed by X-F1REBALL-X.
