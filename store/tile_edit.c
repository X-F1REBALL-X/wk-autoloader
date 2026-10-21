#include <stdio.h>
#include <string.h>

#include <sqlite3.h>

#include "config.h"
#include "tile_edit.h"

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


/* Update one tbl_appinfo/tbl_conceptinfo integer val by key. */
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

/* Walk every per-account icon table and rewrite the store tile fields. */
static int patch_account_tables(sqlite3 *db, const char *concept_id)
{
    sqlite3_stmt *st = NULL;
    int total = 0;
    char sql[384];

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
            /* Home-row uses hubAppUri; gamestore keeps Store sign-in chrome. */
            const char *args[] = {
                TILE_LABEL, TILE_URL, TILE_HUB_URI, TILE_ID
            };
            snprintf(sql, sizeof(sql),
                     "UPDATE %s SET titleName = ?, deeplinkUri = ?, "
                     "hubAppUri = ? WHERE titleId = ?", name);
            n = run_bound(db, sql, args, 4);
        } else if (strncmp(name, "tbl_concepticoninfo_", 20) == 0) {
            /* pic0Info = focus art; hub must not stay pshome:gamestore or the
             * Store RNPS sign-in panel replaces local pic0 after ~1s. */
            const char *args[] = {
                TILE_LABEL, TILE_LABEL, TILE_ASSET_REF, TILE_PIC0_REF,
                TILE_URL, TILE_HUB_URI, concept_id
            };
            snprintf(sql, sizeof(sql),
                     "UPDATE %s SET conceptName = ?, primaryTitleName = ?, "
                     "icon0Info = ?, pic0Info = ?, deeplinkUri = ?, hubAppUri = ? "
                     "WHERE localConceptId = ?",
                     name);
            n = run_bound(db, sql, args, 7);
        } else {
            continue;
        }

        if (n < 0) {
            sqlite3_finalize(st);
            return -1;
        }
        if (n > 0) {
            printf("  %-36s %d\n", name, n);
            total += n;
        }
    }

    sqlite3_finalize(st);
    return total;
}

int tile_edit_app_db(char *concept_out, size_t concept_cap)
{
    sqlite3 *db = NULL;
    int total = 0;
    int n;
    const char *args[6];

    if (sqlite3_open(DB_APP_PATH, &db) != SQLITE_OK) {
        fprintf(stderr, "cannot open %s: %s\n", DB_APP_PATH, sqlite3_errmsg(db));
        if (db) {
            sqlite3_close(db);
        }
        return -1;
    }

    if (!read_concept_id(db, concept_out, concept_cap)) {
        fprintf(stderr, "tile %s is missing from tbl_contentinfo\n", TILE_ID);
        sqlite3_close(db);
        return -1;
    }

    sqlite3_exec(db, "BEGIN IMMEDIATE", NULL, NULL, NULL);

    args[0] = TILE_URL;
    args[1] = TILE_URL;
    args[2] = TILE_ID;
    n = run_bound(db,
        "UPDATE tbl_contentinfo SET pprDeeplinkUri = ?, "
        "AppInfoJson = json_set(AppInfoJson, '$.DEEPLINK_URI', ?) "
        "WHERE titleId = ?",
        args, 3);
    if (n < 0) {
        goto fail;
    }
    total += n;

    /* Match homebrew hub style so http deeplink opens without Store URL bar. */
    args[0] = TILE_HUB_URI;
    args[1] = TILE_HUB_URI;
    args[2] = TILE_ID;
    n = run_bound(db,
        "UPDATE tbl_contentinfo SET pprHubAppUri = ?, "
        "AppInfoJson = json_set(AppInfoJson, '$.HUBAPP_URI', ?) "
        "WHERE titleId = ?",
        args, 3);
    if (n < 0) {
        goto fail;
    }
    total += n;

    args[0] = TILE_LABEL;
    args[1] = TILE_LABEL;
    args[2] = TILE_LABEL;
    args[3] = TILE_ID;
    n = run_bound(db,
        "UPDATE tbl_contentinfo SET titleName = ?, "
        "AppInfoJson = json_set(json_set(AppInfoJson, '$.TITLE', ?), "
        "'$.TITLE_01', ?) WHERE titleId = ?",
        args, 4);
    if (n < 0) {
        goto fail;
    }
    total += n;

    args[0] = TILE_ASSET_REF;
    args[1] = TILE_ASSET_REF;
    args[2] = TILE_ID;
    n = run_bound(db,
        "UPDATE tbl_contentinfo SET icon0Info = ?, "
        "AppInfoJson = json_set(AppInfoJson, '$.icon0Info', ?) "
        "WHERE titleId = ?",
        args, 3);
    if (n < 0) {
        goto fail;
    }
    total += n;

    args[0] = TILE_PIC0_REF;
    args[1] = TILE_PIC0_REF;
    args[2] = TILE_ID;
    n = run_bound(db,
        "UPDATE tbl_contentinfo SET pic0Info = ?, "
        "AppInfoJson = json_set(AppInfoJson, '$.pic0Info', ?) "
        "WHERE titleId = ?",
        args, 3);
    if (n < 0) {
        goto fail;
    }
    total += n;
    printf("  %-36s %d\n", "tbl_contentinfo", total);

    /* Shell path flags: pic0 string alone is not enough; Explore uses these. */
    args[0] = TILE_ID;
    {
        char sql[384];
        sqlite3_stmt *st = NULL;
        snprintf(sql, sizeof(sql),
                 "UPDATE tbl_contentinfo SET "
                 "AppInfoJson = json_set(json_set(AppInfoJson, "
                 "'$._path_pic0_info', %lld), "
                 "'$._path_pic0_info_time_stamp', %d) "
                 "WHERE titleId = ?",
                 (long long)TILE_PIC0_PATH_FLAG, TILE_PIC0_PATH_TS);
        if (sqlite3_prepare_v2(db, sql, -1, &st, NULL) != SQLITE_OK) {
            fprintf(stderr, "prepare failed: %s\n", sqlite3_errmsg(db));
            goto fail;
        }
        sqlite3_bind_text(st, 1, TILE_ID, -1, SQLITE_STATIC);
        if (sqlite3_step(st) != SQLITE_DONE) {
            fprintf(stderr, "step failed: %s\n", sqlite3_errmsg(db));
            sqlite3_finalize(st);
            goto fail;
        }
        n = sqlite3_changes(db);
        sqlite3_finalize(st);
    }
    if (n < 0) {
        goto fail;
    }
    total += n;


    n = patch_account_tables(db, concept_out);
    if (n < 0) {
        goto fail;
    }
    total += n;

    /* Concept row drives home-row focus chrome. Fill pic0 + hub + deeplink so
     * Store Sign-In overlay is less likely to replace our lock background. */
    args[0] = TILE_LABEL;
    args[1] = TILE_ASSET_REF;
    args[2] = TILE_PIC0_REF;
    args[3] = TILE_URL;
    args[4] = TILE_HUB_URI;
    args[5] = concept_out;
    n = run_bound(db,
        "UPDATE tbl_conceptmetadata SET conceptName = ?, icon0Info = ?, "
        "pic0Info = ?, pprDeeplinkUri = ?, pprHubAppUri = ? "
        "WHERE localConceptId = ?",
        args, 6);
    if (n < 0) {
        goto fail;
    }
    if (n > 0) {
        printf("  %-36s %d\n", "tbl_conceptmetadata", n);
        total += n;
    }

    /* Best-effort string patch of ConceptInfoJson hub + display name. */
    {
        sqlite3_stmt *st = NULL;
        /* Also replace leftover AUTO_JB from v4–v9 so hub/detail big title
         * (ConceptInfoJson concept_name*) becomes IgniKey, not only the
         * small under-tile label from titleName columns. */
        const char *sql =
            "UPDATE tbl_conceptmetadata SET ConceptInfoJson = "
            "replace(replace(replace(ConceptInfoJson, "
            "'pshome:gamestore', ?), "
            "'PlayStation Store', ?), "
            "'AUTO_JB', ?) "
            "WHERE localConceptId = ?";
        if (sqlite3_prepare_v2(db, sql, -1, &st, NULL) == SQLITE_OK) {
            sqlite3_bind_text(st, 1, TILE_HUB_URI, -1, SQLITE_STATIC);
            sqlite3_bind_text(st, 2, TILE_LABEL, -1, SQLITE_STATIC);
            sqlite3_bind_text(st, 3, TILE_LABEL, -1, SQLITE_STATIC);
            sqlite3_bind_text(st, 4, concept_out, -1, SQLITE_STATIC);
            if (sqlite3_step(st) == SQLITE_DONE) {
                int ch = sqlite3_changes(db);
                if (ch > 0) {
                    printf("  %-36s %d\n", "ConceptInfoJson", ch);
                    total += ch;
                }
            }
            sqlite3_finalize(st);
        }
    }


    /* ConceptInfoJson field_list path_pic0 flags (same shape as Explore). */
    {
        sqlite3_stmt *st = NULL;
        const char *sql =
            "UPDATE tbl_conceptmetadata SET ConceptInfoJson = "
            "replace(replace(ConceptInfoJson, "
            "'{\"data\":0,\"key\":\"path_pic0_info\",\"size\":8,\"type\":0}', "
            "'{\"data\":-6917529027641081856,\"key\":\"path_pic0_info\",\"size\":8,\"type\":0}'), "
            "'{\"data\":0,\"key\":\"path_pic0_info_time_stamp\",\"size\":8,\"type\":0}', "
            "'{\"data\":315532800,\"key\":\"path_pic0_info_time_stamp\",\"size\":8,\"type\":0}') "
            "WHERE localConceptId = ?";
        if (sqlite3_prepare_v2(db, sql, -1, &st, NULL) == SQLITE_OK) {
            sqlite3_bind_text(st, 1, concept_out, -1, SQLITE_STATIC);
            if (sqlite3_step(st) == SQLITE_DONE) {
                int ch = sqlite3_changes(db);
                if (ch > 0) {
                    printf("  %-36s %d\n", "ConceptInfoJson path_pic0", ch);
                    total += ch;
                }
            }
            sqlite3_finalize(st);
        }
    }

    /* Ask shell not to refresh live/PSN detail over local pic0. */
    args[0] = TILE_ID;
    n = run_bound(db,
        "UPDATE tbl_contentinfo SET "
        "AppInfoJson = json_set(AppInfoJson, '$._disable_live_detail', 1) "
        "WHERE titleId = ?",
        args, 1);
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

static int ensure_deeplink_row(sqlite3 *db)
{
    sqlite3_stmt *st = NULL;
    int exists = 0;
    char meta[64] = "prior";
    const char *args[3];

    if (sqlite3_prepare_v2(db,
            "SELECT 1 FROM tbl_appinfo WHERE titleId = ? AND key = 'DEEPLINK_URI'",
            -1, &st, NULL) == SQLITE_OK) {
        sqlite3_bind_text(st, 1, TILE_ID, -1, SQLITE_STATIC);
        exists = (sqlite3_step(st) == SQLITE_ROW);
        sqlite3_finalize(st);
    }

    if (exists) {
        args[0] = TILE_URL;
        args[1] = TILE_ID;
        return run_bound(db,
            "UPDATE tbl_appinfo SET val = ? WHERE titleId = ? AND key = 'DEEPLINK_URI'",
            args, 2);
    }

    if (sqlite3_prepare_v2(db,
            "SELECT metaDataId FROM tbl_appinfo WHERE titleId = ? LIMIT 1",
            -1, &st, NULL) == SQLITE_OK) {
        sqlite3_bind_text(st, 1, TILE_ID, -1, SQLITE_STATIC);
        if (sqlite3_step(st) == SQLITE_ROW) {
            const unsigned char *m = sqlite3_column_text(st, 0);
            if (m) {
                strncpy(meta, (const char *)m, sizeof(meta) - 1);
            }
        }
        sqlite3_finalize(st);
    }

    args[0] = TILE_ID;
    args[1] = meta;
    args[2] = TILE_URL;
    return run_bound(db,
        "INSERT INTO tbl_appinfo (titleId, metaDataId, key, val) "
        "VALUES (?, ?, 'DEEPLINK_URI', ?)",
        args, 3);
}

int tile_edit_info_db(const char *concept_id)
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

    n = ensure_deeplink_row(db);
    if (n < 0) {
        goto fail;
    }
    total += n;

    args[0] = TILE_HUB_URI;
    args[1] = TILE_ID;
    n = run_bound(db,
        "UPDATE tbl_appinfo SET val = ? WHERE titleId = ? AND key = 'HUBAPP_URI'",
        args, 2);
    if (n < 0) {
        goto fail;
    }
    total += n;

    n = set_info_i64(db, "tbl_appinfo", "titleId", TILE_ID,
                     "_path_pic0_info", TILE_PIC0_PATH_FLAG);
    if (n < 0) {
        goto fail;
    }
    total += n;
    n = set_info_i64(db, "tbl_appinfo", "titleId", TILE_ID,
                     "_path_pic0_info_time_stamp", TILE_PIC0_PATH_TS);
    if (n < 0) {
        goto fail;
    }
    total += n;
    n = set_info_i64(db, "tbl_conceptinfo", "local_concept_id", concept_id,
                     "path_pic0_info", TILE_PIC0_PATH_FLAG);
    if (n < 0) {
        goto fail;
    }
    total += n;
    n = set_info_i64(db, "tbl_conceptinfo", "local_concept_id", concept_id,
                     "path_pic0_info_time_stamp", TILE_PIC0_PATH_TS);
    if (n < 0) {
        goto fail;
    }
    total += n;


    args[0] = "1";
    args[1] = TILE_ID;
    n = run_bound(db,
        "UPDATE tbl_appinfo SET val = ? "
        "WHERE titleId = ? AND key = '_disable_live_detail'",
        args, 2);
    if (n < 0) {
        goto fail;
    }
    total += n;

    args[0] = TILE_LABEL;
    args[1] = TILE_ID;
    n = run_bound(db,
        "UPDATE tbl_appinfo SET val = ? WHERE titleId = ? AND key = 'TITLE'",
        args, 2);
    if (n < 0) {
        goto fail;
    }
    total += n;
    n = run_bound(db,
        "UPDATE tbl_appinfo SET val = ? WHERE titleId = ? AND key = 'TITLE_01'",
        args, 2);
    if (n < 0) {
        goto fail;
    }
    total += n;

    args[0] = TILE_LABEL;
    args[1] = concept_id;
    n = run_bound(db,
        "UPDATE tbl_conceptinfo SET val = ? "
        "WHERE local_concept_id = ? AND key = 'concept_name'",
        args, 2);
    if (n < 0) {
        goto fail;
    }
    total += n;
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
