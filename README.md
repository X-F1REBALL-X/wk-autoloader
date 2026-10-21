# IgniKey

PS5 Store jailbreak host (NPXS40047). Private repo by X-F1REBALL-X.

Current version: **1.1.3**.

1.1.3 installs onto the PlayStation Store tile (Store build).

## What it is

IgniKey remaps the PS5 Store tile so it opens a local WebKit UI on the console.
After sending the ELF to elfldr (`:9021`), the tile opens:

`http://127.0.0.1:1022/app/index.html`

Same `/app/` path as v13, with AppCache, so the page persists across reboots.

## Highlights

- UI: Midnight (the only theme)
- Visible version: `1.1.3`
- Auto Start: off by default
- Cancel: only during the Auto Start countdown (not mid-jailbreak)
- While running: percentage + timer on the round button
- Supported FW: 7.00-13.60 (Relapse only).

## Restore

To return the Store tile to stock, download `IgniKey_Store_Restore_V1.0.0.elf` from the release,
send it to elfldr like the IgniKey ELF, then reboot.

## Build

Requires the PS5 payload SDK with libmicrohttpd.

```
make store
```

Output: `IgniKey-1.0.0.elf`. Store remap sources live in `store/`;
the UI and autoloader live in `frontend/autoloader/`.

## Credits

- X-F1REBALL-X
- Relapse chain
- elfldr
- Store tile remap inspired by notmaj0r
