# Store tile remap

Sources used with the Store-only installer.

- `store_remap.c` / `tile_edit.c` — the original WK build: remaps NPXS40047
  to `http://127.0.0.1:1022/app/index.html` (WebKit/Relapse).
- `yt_remap.c` / `yt_main.c` — the YouTube/Y2JB variant: keeps the Store tile's
  name and art and only repoints its launch URI at the installed YouTube app
  (`psgm:play?id=PPSA0165x`). Build with `make store-yt`.

Both use `/data/autojb-store-only-backup/` for the pre-change DB backup, so the
existing `WK_Autoloader_Store_Restore_V1.2.0.elf` restores the normal Store tile.
