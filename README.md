# WK Autoloader Store

Turns the PS5 Store tile into **WK Autoloader**. Open the Store icon, start the jailbreak (Relapse), and **Elf Launcher** opens when it finishes.

**Release:** [v1.1.3](https://github.com/X-F1REBALL-X/wk-autoloader/releases/tag/v1.1.3) (first public Store build)

## Requirements

- PS5 firmware **7.00–13.60** (Relapse)
- **elfldr** listening on port **9021**
- A way to send an ELF to elfldr (e.g. after a prior jailbreak)

## Install

1. Send [`WK_Autoloader_Store_V1.1.3.elf`](https://github.com/X-F1REBALL-X/wk-autoloader/releases/download/v1.1.3/WK_Autoloader_Store_V1.1.3.elf) to elfldr on port 9021.
2. Wait until install finishes, then reboot the console.
3. Open the **Store** tile on the home screen.
4. Press **Start Jailbreak**. After Relapse completes, Elf Launcher opens automatically.

## Restore the PlayStation Store tile

Send [`WK_Autoloader_Store_Restore_V1.1.3.elf`](https://github.com/X-F1REBALL-X/wk-autoloader/releases/download/v1.1.3/WK_Autoloader_Store_Restore_V1.1.3.elf) to elfldr on port 9021, then reboot.

## Build from source

Needs the [PS5 payload SDK](https://github.com/ps5-payload-dev/sdk) with libmicrohttpd.

```bash
make store SDK=/path/to/ps5-payload-sdk BUILD_TYPE=stable
make restore SDK=/path/to/ps5-payload-sdk
```

Outputs:

- `WK_Autoloader_Store_V1.1.3.elf`
- `WK_Autoloader_Store_Restore_V1.1.3.elf`

## Credits

- Relapse (PS5 WebKit / kernel chain, vendored under `frontend/autoloader/relapse/`)
- [ps5-elfldr](https://github.com/itsPLK/ps5-elfldr) (itsPLK)
- [elf-launcher](https://github.com/X-F1REBALL-X/elf-launcher)
- SQLite (Store tile database remap)

## License

[GNU GPL v3](LICENSE)
