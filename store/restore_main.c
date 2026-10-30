/* Store restore (matches store-only v4).
 *
 * Reverts every key the v4 installer writes on NPXS40047 (Store):
 *   app.db      tbl_contentinfo (columns + AppInfoJson), tbl_iconinfo_*,
 *               tbl_concepticoninfo_*, tbl_conceptmetadata (+ ConceptInfoJson)
 *   appinfo.db  tbl_appinfo, tbl_conceptinfo
 *
 * Stock values come from the install backup (BACKUP_DIR/app.db) when that
 * backup exists and still looks like an untouched Store. Otherwise built-in
 * stock values are used, so the restore works on any console.
 *
 * Restores the Store tile, clears WK AppCache, and deletes WK leftovers
 * (home icons, /data/wkal, appmeta lock art). No WK backups are kept.
 * The current DBs are copied to RESTORE_PRE_DIR during the run, then removed.
 */
#include <errno.h>
#include <signal.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include <dirent.h>
#include <sys/stat.h>
#include <unistd.h>

#include <sqlite3.h>

#include "appcache_clean.h"
#include "config.h"
#include "files.h"
#include "toast.h"

#define STOCK_TITLE "PlayStation Store"
#define STOCK_HUB   "pshome:gamestore"
#define STOCK_ICON_SRC \
    "/system_ex/rnps/apps/NPXS40047/appdb/default/icon0.png"
#define STOCK_ICON_REF STOCK_ICON_SRC "?ts=315532800"
#define LOCK_REF_PREFIX "/user/appmeta/" TILE_ID "/"

#ifndef RESTORE_PRE_DIR
#define RESTORE_PRE_DIR "/data/autojb-store-restore-pre"
#endif

struct stock {
    char title[128];
    char title01[128];
    char hub[160];
    char icon0[256];
    int icon0_in_json;      /* AppInfoJson carries $.icon0Info in stock */
    int live_in_json;       /* AppInfoJson carries $._disable_live_detail */
    long long live_detail;
    long long pic0_flag;
    long long pic0_ts;
    int from_backup;
};

static void stock_defaults(struct stock *s)
{
    memset(s, 0, sizeof(*s));
    snprintf(s->title, sizeof(s->title), "%s", STOCK_TITLE);
    snprintf(s->title01, sizeof(s->title01), "%s", STOCK_TITLE);
    snprintf(s->hub, sizeof(s->hub), "%s", STOCK_HUB);
    snprintf(s->icon0, sizeof(s->icon0), "%s", STOCK_ICON_REF);
    s->icon0_in_json = 0;
    s->live_in_json = 1;
    s->live_detail = 0;
    s->pic0_flag = TILE_PIC0_PATH_FLAG_STOCK;
    s->pic0_ts = TILE_PIC0_PATH_TS_STOCK;
}

static int is_empty(const char *v)
{
    return v == NULL || v[0] == '\0';
}

/* Read stock values from the install backup. Returns 1 only when the backup
 * row still looks like an untouched Store (not a remapped copy). */
static int stock_from_backup(struct stock *s)
{
    sqlite3 *db = NULL;
    sqlite3_stmt *st = NULL;
    struct stat sb;
    int ok = 0;

    if (stat(BACKUP_DIR "/app.db", &sb) != 0 || sb.st_size <= 0) {
        return 0;
    }
    if (sqlite3_open_v2(BACKUP_DIR "/app.db", &db, SQLITE_OPEN_READONLY,
                        NULL) != SQLITE_OK) {
        if (db) {
            sqlite3_close(db);
        }
        return 0;
    }
    if (sqlite3_prepare_v2(db,
            "SELECT titleName, pprHubAppUri, icon0Info, pprDeeplinkUri, "
            "pic0Info, "
            "json_extract(AppInfoJson, '$.TITLE_01'), "
            "json_type(AppInfoJson, '$.icon0Info'), "
            "json_type(AppInfoJson, '$._disable_live_detail'), "
            "json_extract(AppInfoJson, '$._disable_live_detail'), "
            "json_extract(AppInfoJson, '$._path_pic0_info'), "
            "json_extract(AppInfoJson, '$._path_pic0_info_time_stamp'), "
            "json_type(AppInfoJson, '$.DEEPLINK_URI'), "
            "json_type(AppInfoJson, '$.pic0Info') "
            "FROM tbl_contentinfo WHERE titleId = ?",
            -1, &st, NULL) != SQLITE_OK) {
        sqlite3_close(db);
        return 0;
    }
    sqlite3_bind_text(st, 1, TILE_ID, -1, SQLITE_STATIC);
    if (sqlite3_step(st) == SQLITE_ROW) {
        const char *title = (const char *)sqlite3_column_text(st, 0);
        const char *hub = (const char *)sqlite3_column_text(st, 1);
        const char *icon = (const char *)sqlite3_column_text(st, 2);
        const char *deep = (const char *)sqlite3_column_text(st, 3);
        const char *pic0 = (const char *)sqlite3_column_text(st, 4);
        const char *t01 = (const char *)sqlite3_column_text(st, 5);
        const char *icon_json = (const char *)sqlite3_column_text(st, 6);
        const char *live_json = (const char *)sqlite3_column_text(st, 7);
        const char *deep_json = (const char *)sqlite3_column_text(st, 11);
        const char *pic0_json = (const char *)sqlite3_column_text(st, 12);

        if (!is_empty(title) && strcmp(title, TILE_LABEL) != 0 &&
            !is_empty(hub) && strstr(hub, "gamehub") == NULL &&
            is_empty(deep) && is_empty(pic0) &&
            is_empty(deep_json) && is_empty(pic0_json) &&
            !is_empty(icon) && strstr(icon, "/user/appmeta/") == NULL &&
            strlen(title) < sizeof(s->title) &&
            strlen(hub) < sizeof(s->hub) &&
            strlen(icon) < sizeof(s->icon0)) {
            snprintf(s->title, sizeof(s->title), "%s", title);
            snprintf(s->title01, sizeof(s->title01), "%s",
                     (!is_empty(t01) && strlen(t01) < sizeof(s->title01) &&
                      strcmp(t01, TILE_LABEL) != 0) ? t01 : title);
            snprintf(s->hub, sizeof(s->hub), "%s", hub);
            snprintf(s->icon0, sizeof(s->icon0), "%s", icon);
            s->icon0_in_json = !is_empty(icon_json);
            s->live_in_json = !is_empty(live_json);
            if (s->live_in_json) {
                s->live_detail = sqlite3_column_int64(st, 8);
            }
            s->pic0_flag = sqlite3_column_int64(st, 9);
            s->pic0_ts = sqlite3_column_int64(st, 10);
            s->from_backup = 1;
            ok = 1;
        }
    }
    sqlite3_finalize(st);
    sqlite3_close(db);
    return ok;
}

/* Bind text args in order, run one statement, return rows changed or -1. */
static int run_bound(sqlite3 *db, const char *sql, const char **args, int nargs)
{
    sqlite3_stmt *st = NULL;
    int i;
    int changed;

    if (sqlite3_prepare_v2(db, sql, -1, &st, NULL) != SQLITE_OK) {
        fprintf(stderr, "prepare failed: %s\n", sqlite3_errmsg(db));
        return -1;
    }
    for (i = 0; i < nargs; i++) {
        sqlite3_bind_text(st, i + 1, args[i], -1, SQLITE_STATIC);
    }
    if (sqlite3_step(st) != SQLITE_DONE) {
        fprintf(stderr, "step failed: %s\n", sqlite3_errmsg(db));
        sqlite3_finalize(st);
        return -1;
    }
    changed = sqlite3_changes(db);
    sqlite3_finalize(st);
    return changed;
}

/* UPDATE <table> SET val = <int> WHERE <id_col> = ? AND key = ? */
static int set_info_i64(sqlite3 *db, const char *table, const char *id_col,
                        const char *id, const char *key, sqlite3_int64 val)
{
    char sql[256];
    sqlite3_stmt *st = NULL;
    int changed;

    snprintf(sql, sizeof(sql),
             "UPDATE %s SET val = ? WHERE %s = ? AND key = ?", table, id_col);
    if (sqlite3_prepare_v2(db, sql, -1, &st, NULL) != SQLITE_OK) {
        fprintf(stderr, "prepare failed: %s\n", sqlite3_errmsg(db));
        return -1;
    }
    sqlite3_bind_int64(st, 1, val);
    sqlite3_bind_text(st, 2, id, -1, SQLITE_STATIC);
    sqlite3_bind_text(st, 3, key, -1, SQLITE_STATIC);
    if (sqlite3_step(st) != SQLITE_DONE) {
        fprintf(stderr, "step failed: %s\n", sqlite3_errmsg(db));
        sqlite3_finalize(st);
        return -1;
    }
    changed = sqlite3_changes(db);
    sqlite3_finalize(st);
    return changed;
}

static int read_concept_id(sqlite3 *db, char *out, size_t out_cap)
{
    sqlite3_stmt *st = NULL;
    int ok = 0;

    if (sqlite3_prepare_v2(db,
            "SELECT localConceptId FROM tbl_contentinfo WHERE titleId = ?",
            -1, &st, NULL) != SQLITE_OK) {
        return 0;
    }
    sqlite3_bind_text(st, 1, TILE_ID, -1, SQLITE_STATIC);
    if (sqlite3_step(st) == SQLITE_ROW) {
        const unsigned char *v = sqlite3_column_text(st, 0);
        if (v) {
            strncpy(out, (const char *)v, out_cap - 1);
            out[out_cap - 1] = '\0';
            ok = 1;
        }
    }
    sqlite3_finalize(st);
    return ok;
}

/* Per-account icon tables: hub, deeplink, names and art refs. */
static int restore_account_tables(sqlite3 *db, const char *concept_id,
                                  const struct stock *s)
{
    sqlite3_stmt *st = NULL;
    int total = 0;
    char sql[320];

    if (sqlite3_prepare_v2(db,
            "SELECT name FROM sqlite_master WHERE type = 'table'",
            -1, &st, NULL) != SQLITE_OK) {
        return -1;
    }

    while (sqlite3_step(st) == SQLITE_ROW) {
        const char *name = (const char *)sqlite3_column_text(st, 0);
        int n;

        if (name == NULL) {
            continue;
        }

        if (strncmp(name, "tbl_iconinfo_", 13) == 0) {
            const char *args[] = { s->title, s->hub, TILE_ID };
            snprintf(sql, sizeof(sql),
                     "UPDATE %s SET titleName = ?, deeplinkUri = NULL, "
                     "hubAppUri = ? WHERE titleId = ?", name);
            n = run_bound(db, sql, args, 3);
        } else if (strncmp(name, "tbl_concepticoninfo_", 20) == 0) {
            const char *args[] = {
                s->title, s->title, s->icon0, s->hub, concept_id
            };
            snprintf(sql, sizeof(sql),
                     "UPDATE %s SET conceptName = ?, primaryTitleName = ?, "
                     "icon0Info = ?, pic0Info = NULL, deeplinkUri = NULL, "
                     "hubAppUri = ? WHERE localConceptId = ?",
                     name);
            n = run_bound(db, sql, args, 5);
        } else {
            continue;
        }

        if (n < 0) {
            sqlite3_finalize(st);
            return -1;
        }
        total += n;
    }

    sqlite3_finalize(st);
    return total;
}

/* Count references to our lock assets on the Store rows (should be 0). */
static int count_lock_refs(sqlite3 *db, const char *concept_id)
{
    sqlite3_stmt *st = NULL;
    sqlite3_stmt *q = NULL;
    int total = 0;
    char sql[320];
    const char *pat = LOCK_REF_PREFIX "%";

    if (sqlite3_prepare_v2(db,
            "SELECT COUNT(*) FROM tbl_contentinfo WHERE titleId = ? AND "
            "(icon0Info LIKE ? OR pic0Info LIKE ? OR AppInfoJson LIKE ?)",
            -1, &q, NULL) == SQLITE_OK) {
        char json_pat[96];

        snprintf(json_pat, sizeof(json_pat), "%%%s%%", LOCK_REF_PREFIX);
        sqlite3_bind_text(q, 1, TILE_ID, -1, SQLITE_STATIC);
        sqlite3_bind_text(q, 2, pat, -1, SQLITE_STATIC);
        sqlite3_bind_text(q, 3, pat, -1, SQLITE_STATIC);
        sqlite3_bind_text(q, 4, json_pat, -1, SQLITE_STATIC);
        if (sqlite3_step(q) == SQLITE_ROW) {
            total += sqlite3_column_int(q, 0);
        }
        sqlite3_finalize(q);
    }

    if (sqlite3_prepare_v2(db,
            "SELECT name FROM sqlite_master WHERE type = 'table'",
            -1, &st, NULL) != SQLITE_OK) {
        return -1;
    }
    while (sqlite3_step(st) == SQLITE_ROW) {
        const char *name = (const char *)sqlite3_column_text(st, 0);

        if (name == NULL ||
            (strcmp(name, "tbl_conceptmetadata") != 0 &&
             strncmp(name, "tbl_concepticoninfo_", 20) != 0)) {
            continue;
        }
        snprintf(sql, sizeof(sql),
                 "SELECT COUNT(*) FROM %s WHERE localConceptId = ? AND "
                 "(icon0Info LIKE ? OR pic0Info LIKE ?)", name);
        if (sqlite3_prepare_v2(db, sql, -1, &q, NULL) != SQLITE_OK) {
            continue;
        }
        sqlite3_bind_text(q, 1, concept_id, -1, SQLITE_STATIC);
        sqlite3_bind_text(q, 2, pat, -1, SQLITE_STATIC);
        sqlite3_bind_text(q, 3, pat, -1, SQLITE_STATIC);
        if (sqlite3_step(q) == SQLITE_ROW) {
            total += sqlite3_column_int(q, 0);
        }
        sqlite3_finalize(q);
    }
    sqlite3_finalize(st);
    return total;
}

static int restore_app_db(char *concept_out, size_t concept_cap,
                          const struct stock *s, int *lock_refs)
{
    sqlite3 *db = NULL;
    int total = 0;
    int n;
    char sql[1400];
    char cj_flag_set[160], cj_flag_zero[160], cj_ts_set[160], cj_ts_zero[160];
    const char *args[8];

    if (sqlite3_open(DB_APP_PATH, &db) != SQLITE_OK) {
        fprintf(stderr, "cannot open %s: %s\n", DB_APP_PATH, sqlite3_errmsg(db));
        if (db) {
            sqlite3_close(db);
        }
        return -1;
    }

    if (!read_concept_id(db, concept_out, concept_cap)) {
        fprintf(stderr, "tile %s missing\n", TILE_ID);
        sqlite3_close(db);
        return -1;
    }

    sqlite3_exec(db, "BEGIN IMMEDIATE", NULL, NULL, NULL);

    /* tbl_contentinfo: columns and AppInfoJson in one statement. Removes
     * DEEPLINK_URI and pic0Info (absent in stock). icon0Info and
     * _disable_live_detail are set or removed to match stock. Integers go
     * into the SQL text so the JSON keeps real numbers. */
    {
        int na = 0;
        char extra_rm[96];

        extra_rm[0] = '\0';
        if (!s->icon0_in_json) {
            strcat(extra_rm, ", '$.icon0Info'");
        }
        if (!s->live_in_json) {
            strcat(extra_rm, ", '$._disable_live_detail'");
        }
        char live_set[80];

        live_set[0] = '\0';
        if (s->live_in_json) {
            snprintf(live_set, sizeof(live_set),
                     ", '$._disable_live_detail', %lld)",
                     (long long)s->live_detail);
        }
        snprintf(sql, sizeof(sql),
            "UPDATE tbl_contentinfo SET titleName = ?, pprDeeplinkUri = NULL, "
            "pprHubAppUri = ?, icon0Info = ?, pic0Info = NULL, "
            "AppInfoJson = json_remove(%sjson_set(json_set(%s"
            "json_set(json_set(json_set(AppInfoJson, '$.HUBAPP_URI', ?), "
            "'$.TITLE', ?), '$.TITLE_01', ?)%s, "
            "'$._path_pic0_info', %lld), "
            "'$._path_pic0_info_time_stamp', %lld)%s, "
            "'$.DEEPLINK_URI', '$.pic0Info'%s) WHERE titleId = ?",
            s->live_in_json ? "json_set(" : "",
            s->icon0_in_json ? "json_set(" : "",
            s->icon0_in_json ? ", '$.icon0Info', ?)" : "",
            (long long)s->pic0_flag, (long long)s->pic0_ts,
            live_set, extra_rm);
        args[na++] = s->title;
        args[na++] = s->hub;
        args[na++] = s->icon0;
        args[na++] = s->hub;
        args[na++] = s->title;
        args[na++] = s->title01;
        if (s->icon0_in_json) {
            args[na++] = s->icon0;
        }
        args[na++] = TILE_ID;
        n = run_bound(db, sql, args, na);
    }
    if (n < 0) {
        goto fail;
    }
    total += n;

    n = restore_account_tables(db, concept_out, s);
    if (n < 0) {
        goto fail;
    }
    total += n;

    args[0] = s->title;
    args[1] = s->icon0;
    args[2] = s->hub;
    args[3] = concept_out;
    n = run_bound(db,
        "UPDATE tbl_conceptmetadata SET conceptName = ?, icon0Info = ?, "
        "pic0Info = NULL, pprDeeplinkUri = NULL, pprHubAppUri = ? "
        "WHERE localConceptId = ?",
        args, 4);
    if (n < 0) {
        goto fail;
    }
    total += n;

    /* ConceptInfoJson: undo hub + name replace and the path_pic0 entries. */
    snprintf(cj_flag_set, sizeof(cj_flag_set),
             "{\"data\":%lld,\"key\":\"path_pic0_info\",\"size\":8,\"type\":0}",
             (long long)TILE_PIC0_PATH_FLAG);
    snprintf(cj_flag_zero, sizeof(cj_flag_zero),
             "{\"data\":%lld,\"key\":\"path_pic0_info\",\"size\":8,\"type\":0}",
             (long long)s->pic0_flag);
    snprintf(cj_ts_set, sizeof(cj_ts_set),
             "{\"data\":%d,\"key\":\"path_pic0_info_time_stamp\",\"size\":8,"
             "\"type\":0}", TILE_PIC0_PATH_TS);
    snprintf(cj_ts_zero, sizeof(cj_ts_zero),
             "{\"data\":%lld,\"key\":\"path_pic0_info_time_stamp\",\"size\":8,"
             "\"type\":0}", (long long)s->pic0_ts);
    {
        /* Undo IgniKey and any leftover AUTO_JB name in ConceptInfoJson. */
        const char *cj_args[] = {
            TILE_HUB_URI, s->hub, TILE_LABEL, s->title,
            "AUTO_JB", s->title,
            cj_flag_set, cj_flag_zero, cj_ts_set, cj_ts_zero, concept_out
        };
        n = run_bound(db,
            "UPDATE tbl_conceptmetadata SET ConceptInfoJson = "
            "replace(replace(replace(replace(replace(ConceptInfoJson, "
            "?, ?), ?, ?), ?, ?), ?, ?), ?, ?) "
            "WHERE localConceptId = ?",
            cj_args, 11);
    }
    if (n < 0) {
        goto fail;
    }
    total += n;

    sqlite3_exec(db, "COMMIT", NULL, NULL, NULL);
    *lock_refs = count_lock_refs(db, concept_out);
    sqlite3_close(db);
    return total;

fail:
    sqlite3_exec(db, "ROLLBACK", NULL, NULL, NULL);
    sqlite3_close(db);
    return -1;
}

static int restore_info_db(const char *concept_id, const struct stock *s)
{
    sqlite3 *db = NULL;
    int total = 0;
    int n;
    const char *args[2];

    if (sqlite3_open(DB_INFO_PATH, &db) != SQLITE_OK) {
        fprintf(stderr, "cannot open %s: %s\n", DB_INFO_PATH, sqlite3_errmsg(db));
        if (db) {
            sqlite3_close(db);
        }
        return -1;
    }

    sqlite3_exec(db, "BEGIN IMMEDIATE", NULL, NULL, NULL);

    args[0] = TILE_ID;
    n = run_bound(db,
        "DELETE FROM tbl_appinfo WHERE titleId = ? AND key = 'DEEPLINK_URI'",
        args, 1);
    if (n < 0) {
        goto fail;
    }
    total += n;

    args[0] = s->hub;
    args[1] = TILE_ID;
    n = run_bound(db,
        "UPDATE tbl_appinfo SET val = ? WHERE titleId = ? AND key = 'HUBAPP_URI'",
        args, 2);
    if (n < 0) {
        goto fail;
    }
    total += n;

    n = set_info_i64(db, "tbl_appinfo", "titleId", TILE_ID,
                     "_path_pic0_info", s->pic0_flag);
    if (n < 0) {
        goto fail;
    }
    total += n;
    n = set_info_i64(db, "tbl_appinfo", "titleId", TILE_ID,
                     "_path_pic0_info_time_stamp", s->pic0_ts);
    if (n < 0) {
        goto fail;
    }
    total += n;
    n = set_info_i64(db, "tbl_conceptinfo", "local_concept_id", concept_id,
                     "path_pic0_info", s->pic0_flag);
    if (n < 0) {
        goto fail;
    }
    total += n;
    n = set_info_i64(db, "tbl_conceptinfo", "local_concept_id", concept_id,
                     "path_pic0_info_time_stamp", s->pic0_ts);
    if (n < 0) {
        goto fail;
    }
    total += n;

    /* v4 sets the existing _disable_live_detail row to 1; stock is 0. */
    n = set_info_i64(db, "tbl_appinfo", "titleId", TILE_ID,
                     "_disable_live_detail", s->live_detail);
    if (n < 0) {
        goto fail;
    }
    total += n;

    args[0] = s->title;
    args[1] = TILE_ID;
    n = run_bound(db,
        "UPDATE tbl_appinfo SET val = ? WHERE titleId = ? AND key = 'TITLE'",
        args, 2);
    if (n < 0) {
        goto fail;
    }
    total += n;
    args[0] = s->title01;
    n = run_bound(db,
        "UPDATE tbl_appinfo SET val = ? WHERE titleId = ? AND key = 'TITLE_01'",
        args, 2);
    if (n < 0) {
        goto fail;
    }
    total += n;

    args[0] = s->title;
    args[1] = concept_id;
    n = run_bound(db,
        "UPDATE tbl_conceptinfo SET val = ? "
        "WHERE local_concept_id = ? AND key = 'concept_name'",
        args, 2);
    if (n < 0) {
        goto fail;
    }
    total += n;
    args[0] = s->title01;
    n = run_bound(db,
        "UPDATE tbl_conceptinfo SET val = ? "
        "WHERE local_concept_id = ? AND key = 'concept_name_01'",
        args, 2);
    if (n < 0) {
        goto fail;
    }
    total += n;

    sqlite3_exec(db, "COMMIT", NULL, NULL, NULL);
    sqlite3_close(db);
    return total;

fail:
    sqlite3_exec(db, "ROLLBACK", NULL, NULL, NULL);
    sqlite3_close(db);
    return -1;
}

/* Our lock art lives only under TILE_ASSET_DIR. Remove just those two files
 * (and the dir when it ends up empty). */
static void remove_lock_assets(void)
{
    unlink(TILE_ASSET_FILE);
    unlink(TILE_PIC0_FILE);
    unlink(TILE_PIC1_FILE);
    rmdir(TILE_ASSET_DIR);
}

static void restore_log(const char *fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    vprintf(fmt, ap);
    va_end(ap);
    fflush(stdout);
}

/* Remove WK Autoloader leftovers; no backups kept. */
static int wipe_tree(const char *path)
{
    char sub[512];
    struct stat st;
    struct dirent *e;
    DIR *d;
    int n = 0;

    if (lstat(path, &st) != 0)
        return 0;
    if (S_ISDIR(st.st_mode)) {
        d = opendir(path);
        if (!d)
            return 0;
        while ((e = readdir(d))) {
            if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, ".."))
                continue;
            snprintf(sub, sizeof(sub), "%s/%s", path, e->d_name);
            n += wipe_tree(sub);
        }
        closedir(d);
        if (!rmdir(path))
            n++;
    } else if (!unlink(path)) {
        n++;
    }
    return n;
}

static void wipe_one(const char *path, int *total)
{
    struct stat st;
    int n;

    if (stat(path, &st) != 0)
        return;
    n = wipe_tree(path);
    *total += n;
    restore_log("[WKRESTORE] wiped %s (%d)\n", path, n);
}

static void wipe_appcache_files_under_home(int *total)
{
    DIR *home;
    struct dirent *e;
    char path[512];
    static const char *const names[] = {
        "webkit/shell/appcache/ApplicationCache.db",
        "webkit/shell/appcache/ApplicationCache.db-wal",
        "webkit/shell/appcache/ApplicationCache.db-shm",
        "webkit/shell/appcache/ApplicationCache.db-journal",
        "webkit/shell/appcache/ApplicationCache",
        "webkit/shell/appcache/OfflineWebApplicationCache",
        "webkit/shell/ApplicationCache.db",
        "webkit/shell/ApplicationCache.db-wal",
        "webkit/shell/ApplicationCache.db-shm",
        "webkit/shell/ApplicationCache",
        "webkit/shell/OfflineWebApplicationCache",
        NULL
    };
    int i;

    home = opendir("/user/home");
    if (!home)
        return;
    while ((e = readdir(home))) {
        if (e->d_name[0] == '.')
            continue;
        for (i = 0; names[i]; i++) {
            snprintf(path, sizeof(path), "/user/home/%s/%s", e->d_name, names[i]);
            wipe_one(path, total);
        }
    }
    closedir(home);
}

static void wipe_wk_leftovers(void)
{
    int total = 0;

    wipe_one("/user/app/SLKT00001", &total);
    wipe_one("/user/app/ELFL00001", &total);
    wipe_one("/user/app/PLDM00001", &total);
    wipe_one(TILE_ASSET_FILE, &total);
    wipe_one(TILE_PIC0_FILE, &total);
    wipe_one(TILE_PIC1_FILE, &total);
    wipe_one(TILE_ASSET_DIR, &total);
    wipe_appcache_files_under_home(&total);
    wipe_one("/data/wkal", &total);
    wipe_one(BACKUP_DIR, &total);
    wipe_one(RESTORE_PRE_DIR, &total);
    toast("Removed WK leftovers (%d).", total);
    restore_log("[WKRESTORE] leftover wipe total=%d\n", total);
}


int main(void)
{
    char concept[128];
    struct stock stock;
    struct stat st;
    int app_rows;
    int info_rows;
    int lock_refs = 0;

    if (stat(DB_APP_PATH, &st) != 0 || stat(DB_INFO_PATH, &st) != 0) {
        toast("Store databases not found.");
        return 1;
    }

    toast("Restoring PlayStation Store...");

    /* Safety copy of the current DBs before any change. */
    if (files_make_dir(RESTORE_PRE_DIR) != 0 ||
        files_duplicate(DB_APP_PATH, RESTORE_PRE_DIR "/app.db") != 0 ||
        files_duplicate(DB_INFO_PATH, RESTORE_PRE_DIR "/appinfo.db") != 0) {
        toast("Backup failed. Aborting, nothing changed.");
        return 1;
    }

    stock_defaults(&stock);
    if (stock_from_backup(&stock)) {
        toast("Using install backup for stock values.");
    } else {
        toast("No usable backup. Using built-in stock values.");
    }

    memset(concept, 0, sizeof(concept));
    app_rows = restore_app_db(concept, sizeof(concept), &stock, &lock_refs);
    if (app_rows < 0) {
        toast("App database restore failed. Nothing changed.");
        return 1;
    }

    info_rows = restore_info_db(concept, &stock);
    if (info_rows < 0) {
        toast("Appinfo restore failed. Saved copy: %s", RESTORE_PRE_DIR);
        return 1;
    }

    if (lock_refs == 0) {
        remove_lock_assets();
    } else {
        toast("Warning: %d lock refs remain.", lock_refs);
    }

    /* Clear Store AppCache origin, then delete all WK leftovers (no backups). */
    signal(SIGPIPE, SIG_IGN);
    int ac = appcache_clean_store_all_users(restore_log);
    restore_log("[WKRESTORE] appcache_clean_store_all_users -> %d\n", ac);
    wipe_wk_leftovers();

    toast("Store restored (%d rows). Reboot now.", app_rows + info_rows);
    return 0;
}
