/*
 * Store tile -> YouTube (Y2JB) remap.
 *
 * The PS5 Store tile (NPXS40047) is a normal shell tile whose DEEPLINK_URI
 * decides what opens when it is pressed. wk-autoloader points it at a local
 * WebKit page; this variant points it at the installed YouTube app instead:
 *
 *     psgm:play?id=PPSA0165x
 *
 * YouTube then starts normally and the Y2JB payload already present in its
 * download0.dat runs the userland + kernel exploit and loads elfldr.
 *
 * Deliberately left untouched: titleName, icon0Info, pic0Info, pic1Info and
 * the _disable_live_detail flags. The tile keeps the stock Store look; only
 * the launch target changes.
 *
 * The DBs are backed up to BACKUP_DIR (same directory the existing Store
 * restore payload uses) before anything is written.
 */

#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

#include <sqlite3.h>

#include "config.h"
#include "files.h"
#include "toast.h"
#include "yt_remap.h"

/* YouTube is shipped under these title IDs. The payload is installed in
 * whichever one exists; the installer copies that app's own deeplink so the
 * region does not need to be hardcoded. */
#define YT_ID_US "PPSA01650"
#define YT_ID_EU "PPSA01651"
#define YT_ID_JP "PPSA01652"

#ifndef YT_DOWNLOAD_DIR
#define YT_DOWNLOAD_DIR "/user/download"
#endif

static const char *const yt_ids[] = { YT_ID_US, YT_ID_EU, YT_ID_JP };

static int db_present(const char *path)
{
    struct stat st;
    return stat(path, &st) == 0 && S_ISREG(st.st_mode) && st.st_size > 0;
}

/* Bind text args in order, run one statement, return rows changed or -1. */
static int run_bound(sqlite3 *db, const char *sql, const char *const *args,
                     int nargs)
{
    sqlite3_stmt *st = NULL;
    int i;
    int changed;

    if (sqlite3_prepare_v2(db, sql, -1, &st, NULL) != SQLITE_OK) {
        printf("[YT] prepare failed: %s\n", sqlite3_errmsg(db));
        return -1;
    }
    for (i = 0; i < nargs; i++)
        sqlite3_bind_text(st, i + 1, args[i], -1, SQLITE_STATIC);

    if (sqlite3_step(st) != SQLITE_DONE) {
        printf("[YT] step failed: %s\n", sqlite3_errmsg(db));
        sqlite3_finalize(st);
        return -1;
    }
    changed = sqlite3_changes(db);
    sqlite3_finalize(st);
    return changed;
}

/* Run a one-row, one-column text query. Returns 1 when a non-empty value was
 * copied to out, 0 otherwise. */
static int query_value(sqlite3 *db, const char *sql, const char *bind1,
                       char *out, size_t out_cap)
{
    sqlite3_stmt *st = NULL;
    int found = 0;

    if (sqlite3_prepare_v2(db, sql, -1, &st, NULL) != SQLITE_OK)
        return 0;
    if (bind1)
        sqlite3_bind_text(st, 1, bind1, -1, SQLITE_STATIC);

    if (sqlite3_step(st) == SQLITE_ROW) {
        const unsigned char *v = sqlite3_column_text(st, 0);
        if (v && v[0]) {
            snprintf(out, out_cap, "%s", (const char *)v);
            found = 1;
        }
    }
    sqlite3_finalize(st);
    return found;
}

/* Is the title present in app.db? Used as a fallback when appinfo.db has no
 * DEEPLINK_URI row for it. */
static int content_exists(const char *title_id)
{
    sqlite3 *db = NULL;
    sqlite3_stmt *st = NULL;
    int found = 0;

    if (sqlite3_open_v2(DB_APP_PATH, &db, SQLITE_OPEN_READONLY, NULL) !=
        SQLITE_OK) {
        if (db)
            sqlite3_close(db);
        return 0;
    }
    sqlite3_busy_timeout(db, 5000);
    if (sqlite3_prepare_v2(db,
            "SELECT 1 FROM tbl_contentinfo WHERE titleId = ? LIMIT 1",
            -1, &st, NULL) == SQLITE_OK) {
        sqlite3_bind_text(st, 1, title_id, -1, SQLITE_STATIC);
        found = (sqlite3_step(st) == SQLITE_ROW);
    }
    sqlite3_finalize(st);
    sqlite3_close(db);
    return found;
}

/* Y2JB replaces /user/download/<title>/download0.dat with a ~336 MB image.
 * Use it to pick the right region when several YouTube variants exist. */
static int y2jb_payload_present(const char *title_id)
{
    char path[160];
    struct stat st;

    snprintf(path, sizeof(path), "%s/%s/download0.dat", YT_DOWNLOAD_DIR,
             title_id);
    return stat(path, &st) == 0 && S_ISREG(st.st_mode) &&
           st.st_size > 1024 * 1024;
}

static int read_yt_values(sqlite3 *db, const char *title_id, char *deeplink,
                          size_t deeplink_cap, char *hub, size_t hub_cap)
{
    if (!query_value(db,
            "SELECT val FROM tbl_appinfo WHERE titleId = ? "
            "AND key = 'DEEPLINK_URI' LIMIT 1",
            title_id, deeplink, deeplink_cap))
        return 0;

    if (!query_value(db,
            "SELECT val FROM tbl_appinfo WHERE titleId = ? "
            "AND key = 'HUBAPP_URI' LIMIT 1",
            title_id, hub, hub_cap))
        snprintf(hub, hub_cap, "pshome:gamehub?titleId=%s", title_id);
    return 1;
}

/* Find the installed YouTube app and copy its own deeplink/hub values.
 * Prefers a variant that actually has the Y2JB download0.dat. */
static int find_youtube(char *title_id, size_t title_cap, char *deeplink,
                        size_t deeplink_cap, char *hub, size_t hub_cap)
{
    sqlite3 *db = NULL;
    char best_id[32] = "";
    size_t i;

    if (sqlite3_open_v2(DB_INFO_PATH, &db, SQLITE_OPEN_READONLY, NULL) !=
        SQLITE_OK) {
        if (db)
            sqlite3_close(db);
        return 0;
    }
    sqlite3_busy_timeout(db, 5000);

    for (i = 0; i < sizeof(yt_ids) / sizeof(yt_ids[0]); i++) {
        char probe[256];

        if (!query_value(db,
                "SELECT val FROM tbl_appinfo WHERE titleId = ? "
                "AND key = 'DEEPLINK_URI' LIMIT 1",
                yt_ids[i], probe, sizeof(probe)))
            continue;

        if (best_id[0] == '\0')
            snprintf(best_id, sizeof(best_id), "%s", yt_ids[i]);
        if (y2jb_payload_present(yt_ids[i])) {
            snprintf(best_id, sizeof(best_id), "%s", yt_ids[i]);
            break;
        }
    }

    if (best_id[0] != '\0' &&
        read_yt_values(db, best_id, deeplink, deeplink_cap, hub, hub_cap)) {
        snprintf(title_id, title_cap, "%s", best_id);
        sqlite3_close(db);
        return 1;
    }

    sqlite3_close(db);
    return 0;
}

static int backup_db_pair(void)
{
    /* Keep the first stock copy. The existing Store restore payload reads
     * this same directory. */
    if (db_present(BACKUP_DIR "/app.db") &&
        db_present(BACKUP_DIR "/appinfo.db"))
        return 0;

    if (files_make_dir(BACKUP_DIR) != 0) {
        printf("[YT] mkdir %s failed: %s\n", BACKUP_DIR, strerror(errno));
        return -1;
    }
    if (files_duplicate(DB_APP_PATH, BACKUP_DIR "/app.db") != 0) {
        printf("[YT] backup app.db failed\n");
        return -1;
    }
    if (files_duplicate(DB_INFO_PATH, BACKUP_DIR "/appinfo.db") != 0) {
        printf("[YT] backup appinfo.db failed\n");
        return -1;
    }
    printf("[YT] backup written to %s\n", BACKUP_DIR);
    return 0;
}

static int get_store_concept(sqlite3 *db, char *out, size_t out_cap)
{
    if (query_value(db,
            "SELECT localConceptId FROM tbl_contentinfo WHERE titleId = ? "
            "LIMIT 1",
            TILE_ID, out, out_cap))
        return 0;
    printf("[YT] tile %s is missing from tbl_contentinfo\n", TILE_ID);
    return -1;
}

static int patch_account_tables(sqlite3 *db, const char *concept_id,
                                const char *deeplink, const char *hub)
{
    sqlite3_stmt *st = NULL;
    char sql[384];
    int rc = 0;

    if (sqlite3_prepare_v2(db,
            "SELECT name FROM sqlite_master WHERE type = 'table'",
            -1, &st, NULL) != SQLITE_OK)
        return -1;

    while (sqlite3_step(st) == SQLITE_ROW) {
        const char *name = (const char *)sqlite3_column_text(st, 0);
        const char *args[3];

        if (name == NULL)
            continue;

        if (strncmp(name, "tbl_iconinfo_", 13) == 0) {
            args[0] = deeplink;
            args[1] = hub;
            args[2] = TILE_ID;
            snprintf(sql, sizeof(sql),
                     "UPDATE %s SET deeplinkUri = ?, hubAppUri = ? "
                     "WHERE titleId = ?", name);
            if (run_bound(db, sql, args, 3) < 0) {
                rc = -1;
                break;
            }
        } else if (strncmp(name, "tbl_concepticoninfo_", 20) == 0) {
            args[0] = deeplink;
            args[1] = hub;
            args[2] = concept_id;
            snprintf(sql, sizeof(sql),
                     "UPDATE %s SET deeplinkUri = ?, hubAppUri = ? "
                     "WHERE localConceptId = ?", name);
            if (run_bound(db, sql, args, 3) < 0) {
                rc = -1;
                break;
            }
        }
    }

    sqlite3_finalize(st);
    return rc;
}

static int patch_app_db(const char *deeplink, const char *hub)
{
    sqlite3 *db = NULL;
    char concept[128];
    const char *args[3];
    int rc = -1;

    if (sqlite3_open(DB_APP_PATH, &db) != SQLITE_OK) {
        printf("[YT] cannot open %s: %s\n", DB_APP_PATH, sqlite3_errmsg(db));
        if (db)
            sqlite3_close(db);
        return -1;
    }
    sqlite3_busy_timeout(db, 5000);

    memset(concept, 0, sizeof(concept));
    if (get_store_concept(db, concept, sizeof(concept)) != 0)
        goto out;

    if (sqlite3_exec(db, "BEGIN IMMEDIATE", NULL, NULL, NULL) != SQLITE_OK) {
        printf("[YT] BEGIN app.db failed: %s\n", sqlite3_errmsg(db));
        goto out;
    }

    args[0] = deeplink;
    args[1] = deeplink;
    args[2] = TILE_ID;
    if (run_bound(db,
            "UPDATE tbl_contentinfo SET pprDeeplinkUri = ?, "
            "AppInfoJson = json_set(COALESCE(AppInfoJson, '{}'), "
            "'$.DEEPLINK_URI', ?) WHERE titleId = ?",
            args, 3) < 0)
        goto rollback;

    args[0] = hub;
    args[1] = hub;
    args[2] = TILE_ID;
    if (run_bound(db,
            "UPDATE tbl_contentinfo SET pprHubAppUri = ?, "
            "AppInfoJson = json_set(COALESCE(AppInfoJson, '{}'), "
            "'$.HUBAPP_URI', ?) WHERE titleId = ?",
            args, 3) < 0)
        goto rollback;

    args[0] = deeplink;
    args[1] = hub;
    args[2] = concept;
    if (run_bound(db,
            "UPDATE tbl_conceptmetadata SET pprDeeplinkUri = ?, "
            "pprHubAppUri = ? WHERE localConceptId = ?",
            args, 3) < 0)
        goto rollback;

    if (patch_account_tables(db, concept, deeplink, hub) != 0)
        goto rollback;

    if (sqlite3_exec(db, "COMMIT", NULL, NULL, NULL) != SQLITE_OK) {
        printf("[YT] COMMIT app.db failed: %s\n", sqlite3_errmsg(db));
        goto rollback;
    }
    rc = 0;
    goto out;

rollback:
    sqlite3_exec(db, "ROLLBACK", NULL, NULL, NULL);
out:
    sqlite3_close(db);
    return rc;
}

/* UPDATE, or INSERT when the Store tile has no row for this key. */
static int set_appinfo(sqlite3 *db, const char *title_id, const char *key,
                       const char *val)
{
    const char *args[4];
    char meta[64] = "prior";
    int n;

    args[0] = val;
    args[1] = title_id;
    args[2] = key;
    n = run_bound(db,
                  "UPDATE tbl_appinfo SET val = ? WHERE titleId = ? "
                  "AND key = ?", args, 3);
    if (n != 0)
        return n; /* -1 on failure, >0 when the row existed */

    query_value(db,
                "SELECT metaDataId FROM tbl_appinfo WHERE titleId = ? LIMIT 1",
                title_id, meta, sizeof(meta));

    args[0] = title_id;
    args[1] = meta;
    args[2] = key;
    args[3] = val;
    return run_bound(db,
                     "INSERT INTO tbl_appinfo (titleId, metaDataId, key, val) "
                     "VALUES (?, ?, ?, ?)", args, 4);
}

static int patch_info_db(const char *deeplink, const char *hub)
{
    sqlite3 *db = NULL;
    int rc = -1;

    if (sqlite3_open(DB_INFO_PATH, &db) != SQLITE_OK) {
        printf("[YT] cannot open %s: %s\n", DB_INFO_PATH, sqlite3_errmsg(db));
        if (db)
            sqlite3_close(db);
        return -1;
    }
    sqlite3_busy_timeout(db, 5000);

    if (sqlite3_exec(db, "BEGIN IMMEDIATE", NULL, NULL, NULL) != SQLITE_OK) {
        printf("[YT] BEGIN appinfo.db failed: %s\n", sqlite3_errmsg(db));
        goto out;
    }

    if (set_appinfo(db, TILE_ID, "DEEPLINK_URI", deeplink) < 0)
        goto rollback;
    if (set_appinfo(db, TILE_ID, "HUBAPP_URI", hub) < 0)
        goto rollback;

    if (sqlite3_exec(db, "COMMIT", NULL, NULL, NULL) != SQLITE_OK) {
        printf("[YT] COMMIT appinfo.db failed: %s\n", sqlite3_errmsg(db));
        goto rollback;
    }
    rc = 0;
    goto out;

rollback:
    sqlite3_exec(db, "ROLLBACK", NULL, NULL, NULL);
out:
    sqlite3_close(db);
    return rc;
}

/* No appinfo row: fall back to a title that really exists in app.db. */
static int fallback_youtube(char *title_id, size_t title_cap, char *deeplink,
                            size_t deeplink_cap, char *hub, size_t hub_cap)
{
    char best_id[32] = "";
    size_t i;

    for (i = 0; i < sizeof(yt_ids) / sizeof(yt_ids[0]); i++) {
        if (!content_exists(yt_ids[i]))
            continue;

        if (best_id[0] == '\0')
            snprintf(best_id, sizeof(best_id), "%s", yt_ids[i]);
        if (y2jb_payload_present(yt_ids[i])) {
            snprintf(best_id, sizeof(best_id), "%s", yt_ids[i]);
            break;
        }
    }

    if (best_id[0] == '\0')
        return 0;

    snprintf(title_id, title_cap, "%s", best_id);
    snprintf(deeplink, deeplink_cap, "psgm:play?id=%s", best_id);
    snprintf(hub, hub_cap, "pshome:gamehub?titleId=%s", best_id);
    return 1;
}

int yt_remap_apply(void)
{
    char title_id[32];
    char deeplink[256];
    char hub[256];

    if (!db_present(DB_APP_PATH) || !db_present(DB_INFO_PATH)) {
        toast("Store databases not found.");
        return -1;
    }

    memset(title_id, 0, sizeof(title_id));
    memset(deeplink, 0, sizeof(deeplink));
    memset(hub, 0, sizeof(hub));

    if (!find_youtube(title_id, sizeof(title_id), deeplink,
                      sizeof(deeplink), hub, sizeof(hub)) &&
        !fallback_youtube(title_id, sizeof(title_id), deeplink,
                          sizeof(deeplink), hub, sizeof(hub))) {
        printf("[YT] no installed YouTube (PPSA0165x) found\n");
        toast("YouTube app not found.");
        return -1;
    }

    printf("[YT] target %s\n", title_id);
    printf("[YT] deeplink %s\n", deeplink);
    printf("[YT] hub %s\n", hub);
    toast("Pointing Store tile at YouTube...");

    if (backup_db_pair() != 0) {
        toast("Backup failed.");
        return -1;
    }
    if (patch_app_db(deeplink, hub) != 0) {
        toast("app.db update failed.");
        return -1;
    }
    if (patch_info_db(deeplink, hub) != 0) {
        toast("appinfo.db update failed.");
        return -1;
    }

    printf("[YT] Store tile now launches %s\n", title_id);
    toast("Store tile now launches YouTube. Reboot.");
    return 0;
}
