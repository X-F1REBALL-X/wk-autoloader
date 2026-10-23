<img src="docs/img/banner.png" alt="WK Autoloader Store">

Turns the PS5 Store tile into WK Autoloader: open the tile, start the jailbreak, and Elf Launcher opens when it finishes.

## Quick start

1. Send [`WK_Autoloader_Store_V1.2.0.elf`](https://github.com/X-F1REBALL-X/wk-autoloader/releases/download/v1.2.0/WK_Autoloader_Store_V1.2.0.elf) to elfldr on port `9021`.
2. Wait for the install to finish, then reboot.
3. Open the **Store** tile and press **Start Jailbreak**.

## Contents

- [Features](#features)
- [Gallery](#gallery)
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

## Gallery

Store tile icon and background:

<p><img src="store/icon0.png" alt="Store tile icon" width="200"> <img src="store/pic0.png" alt="Store tile background" width="480"></p>

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

## What's new in 1.2.0

Changes since 1.1.3.

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
```

Outputs `WK_Autoloader_Store_V1.2.0.elf` and `WK_Autoloader_Store_Restore_V1.2.0.elf`.

## License

[GNU GPL v3](LICENSE).

## Credits

- Relapse (PS5 WebKit / kernel chain, vendored under `frontend/autoloader/relapse/`)
- [ps5-elfldr](https://github.com/itsPLK/ps5-elfldr) by itsPLK
- [elf-launcher](https://github.com/X-F1REBALL-X/elf-launcher)
- SQLite (Store tile database remap)

Developed by X-F1REBALL-X.
