#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

#include <sqlite3.h>

#include "config.h"
#include "files.h"
#include "icon_png.h"
#include "pic0_png.h"
#include "store_remap.h"
#include "tile_edit.h"
#include "toast.h"
#include "wkali.h"

static int databases_present(void)
{
    struct stat st;
    if (stat(DB_APP_PATH, &st) != 0)
        return 0;
    if (stat(DB_INFO_PATH, &st) != 0)
        return 0;
    return 1;
}

static int assets_present(void)
{
    struct stat st;
    if (stat(TILE_ASSET_FILE, &st) != 0 || st.st_size <= 0)
        return 0;
    if (stat(TILE_PIC0_FILE, &st) != 0 || st.st_size <= 0)
        return 0;
    return 1;
}

/* True when deeplink + hub already match the store-only targets. */
static int already_remapped(void)
{
    sqlite3 *db = NULL;
    sqlite3_stmt *st = NULL;
    int ok = 0;
    const char *v;

    if (!assets_present())
        return 0;
    if (sqlite3_open(DB_INFO_PATH, &db) != SQLITE_OK) {
        if (db)
            sqlite3_close(db);
        return 0;
    }
    sqlite3_busy_timeout(db, 5000);
    if (sqlite3_prepare_v2(db,
            "SELECT val FROM tbl_appinfo WHERE titleId = ? AND key = ?",
            -1, &st, NULL) != SQLITE_OK) {
        sqlite3_close(db);
        return 0;
    }
    sqlite3_bind_text(st, 1, TILE_ID, -1, SQLITE_STATIC);
    sqlite3_bind_text(st, 2, "DEEPLINK_URI", -1, SQLITE_STATIC);
    if (sqlite3_step(st) != SQLITE_ROW) {
        sqlite3_finalize(st);
        sqlite3_close(db);
        return 0;
    }
    v = (const char *)sqlite3_column_text(st, 0);
    if (!v || strcmp(v, TILE_URL) != 0) {
        sqlite3_finalize(st);
        sqlite3_close(db);
        return 0;
    }
    sqlite3_finalize(st);

    if (sqlite3_prepare_v2(db,
            "SELECT val FROM tbl_appinfo WHERE titleId = ? AND key = ?",
            -1, &st, NULL) != SQLITE_OK) {
        sqlite3_close(db);
        return 0;
    }
    sqlite3_bind_text(st, 1, TILE_ID, -1, SQLITE_STATIC);
    sqlite3_bind_text(st, 2, "HUBAPP_URI", -1, SQLITE_STATIC);
    if (sqlite3_step(st) == SQLITE_ROW) {
        v = (const char *)sqlite3_column_text(st, 0);
        if (v && strcmp(v, TILE_HUB_URI) == 0)
            ok = 1;
    }
    sqlite3_finalize(st);
    if (!ok) {
        sqlite3_close(db);
        return 0;
    }
    ok = 0;
    if (sqlite3_prepare_v2(db,
            "SELECT val FROM tbl_appinfo WHERE titleId = ? AND key = ?",
            -1, &st, NULL) != SQLITE_OK) {
        sqlite3_close(db);
        return 0;
    }
    sqlite3_bind_text(st, 1, TILE_ID, -1, SQLITE_STATIC);
    sqlite3_bind_text(st, 2, "_path_pic0_info", -1, SQLITE_STATIC);
    if (sqlite3_step(st) == SQLITE_ROW) {
        if (sqlite3_column_type(st, 0) != SQLITE_NULL &&
            sqlite3_column_int64(st, 0) == (sqlite3_int64)TILE_PIC0_PATH_FLAG)
            ok = 1;
    }
    sqlite3_finalize(st);
    sqlite3_close(db);
    return ok;
}

static int save_backups(void)
{
    if (files_make_dir(BACKUP_DIR) != 0)
        return -1;
    if (files_duplicate(DB_APP_PATH, BACKUP_DIR "/app.db") != 0)
        return -1;
    if (files_duplicate(DB_INFO_PATH, BACKUP_DIR "/appinfo.db") != 0)
        return -1;
    return 0;
}

static int install_assets(void)
{
    int r;

    if (files_make_dir(TILE_ASSET_DIR) != 0) {
        wkali_log("[STORE] mkdir %s failed\n", TILE_ASSET_DIR);
        return -1;
    }

    r = files_store_if_changed(TILE_ASSET_FILE, g_icon_png, g_icon_png_len);
    if (r < 0) {
        wkali_log("[STORE] write %s failed\n", TILE_ASSET_FILE);
        return -1;
    }
    wkali_log("[STORE] %s %s (%u bytes)\n",
              r ? "wrote" : "unchanged", TILE_ASSET_FILE, (unsigned)g_icon_png_len);

    /* pic0 = PS5 home hover / focus background (1920x1080). */
    r = files_store_if_changed(TILE_PIC0_FILE, g_pic0_png, g_pic0_png_len);
    if (r < 0) {
        wkali_log("[STORE] write %s failed\n", TILE_PIC0_FILE);
        return -1;
    }
    wkali_log("[STORE] %s %s (%u bytes)\n",
              r ? "wrote" : "unchanged", TILE_PIC0_FILE, (unsigned)g_pic0_png_len);

    /* pic1 = secondary start/detail art; same image so ShellUI variants refresh. */
    r = files_store_if_changed(TILE_PIC1_FILE, g_pic0_png, g_pic0_png_len);
    if (r < 0) {
        wkali_log("[STORE] write %s failed\n", TILE_PIC1_FILE);
        return -1;
    }
    wkali_log("[STORE] %s %s (%u bytes)\n",
              r ? "wrote" : "unchanged", TILE_PIC1_FILE, (unsigned)g_pic0_png_len);

    wkali_log("[STORE] db refs icon0=%s pic0=%s\n", TILE_ASSET_REF, TILE_PIC0_REF);
    return 0;
}

int store_remap_apply(void)
{
    char concept[128];
    int app_rows;
    int info_rows;
    int was_mapped;

    if (!databases_present()) {
        toast("Store databases not found.");
        return -1;
    }

    /* Never skip DB writes: v3 fast-path returned early once deeplink+hub+
     * path flags matched, so later key fixes (concepticoninfo hubAppUri,
     * disable_live_detail, asset ?v=) never landed on a second send. Always
     * re-apply tile_edit (idempotent UPDATEs). Skip only the one-time backup
     * when already remapped. */
    wkali_log("[STORE] remap start\n");
    toast("Updating Store tile…");
    was_mapped = already_remapped();
    wkali_log("[STORE] already_remapped=%d\n", was_mapped);
    if (!was_mapped) {
        if (save_backups() != 0) {
            toast("Backup failed.");
            return -1;
        }
    }

    wkali_log("[STORE] installing assets…\n");
    if (install_assets() != 0) {
        wkali_log("[STORE] asset install failed\n");
        toast("Asset install failed.");
        return -1;
    }
    wkali_log("[STORE] assets ok\n");

    memset(concept, 0, sizeof(concept));
    wkali_log("[STORE] editing app.db…\n");
    app_rows = tile_edit_app_db(concept, sizeof(concept));
    if (app_rows < 0) {
        wkali_log("[STORE] app.db update failed\n");
        toast("App database update failed.");
        return -1;
    }
    wkali_log("[STORE] editing appinfo.db…\n");
    info_rows = tile_edit_info_db(concept);
    if (info_rows < 0) {
        wkali_log("[STORE] appinfo.db update failed\n");
        toast("Appinfo database update failed.");
        return -1;
    }

    (void)app_rows;
    (void)info_rows;
    wkali_log("[STORE] remap done\n");
    toast("Store tile ready. Reboot now");
    return 0;
}
