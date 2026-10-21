#pragma once

/* Store tile remapper for fresh install: open local WK Autoloader. */

#define TILE_ID     "NPXS40047"

#ifndef TILE_LABEL
#define TILE_LABEL  "WK Autoloader"
#endif

#ifndef TILE_URL
#define TILE_URL    "http://127.0.0.1:1022/app/index.html"
#endif

/* Hub style used by homebrew tiles. Note: any http(s) DEEPLINK_URI still opens
 * the Modal Internet Browser chrome (title + URL). Hub alone does not remove it. */
#ifndef TILE_HUB_URI
#define TILE_HUB_URI "pshome:gamehub?titleId=" TILE_ID
#endif

#ifndef TILE_ASSET_DIR
#define TILE_ASSET_DIR   "/user/appmeta/" TILE_ID
#endif
#define TILE_ASSET_FILE  TILE_ASSET_DIR "/icon0.png"
#define TILE_PIC0_FILE   TILE_ASSET_DIR "/pic0.png"

#define TILE_ASSET_REF   TILE_ASSET_FILE "?v=34"
#define TILE_PIC0_REF    TILE_PIC0_FILE "?v=34"

/* Shell path flags so focus pic0 is treated as present (Explore / fpkg_db.c). */
#define TILE_PIC0_PATH_FLAG        (-6917529027641081856LL)
#define TILE_PIC0_PATH_TS          315532800
#define TILE_PIC0_PATH_FLAG_STOCK  0LL
#define TILE_PIC0_PATH_TS_STOCK    0

#ifndef DB_APP_PATH
#define DB_APP_PATH      "/system_data/priv/mms/app.db"
#endif
#ifndef DB_INFO_PATH
#define DB_INFO_PATH     "/system_data/priv/mms/appinfo.db"
#endif
#ifndef BACKUP_DIR
#define BACKUP_DIR       "/data/autojb-store-only-backup"
#endif
