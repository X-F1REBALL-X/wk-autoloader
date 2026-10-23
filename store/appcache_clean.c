/* Per-user WebKit AppCache backup / selective clear / restore.
 *
 * WebKit keeps AppCache in <cache dir>/ApplicationCache.db (sqlite) and
 * large resources as flat files in <cache dir>/ApplicationCache/.
 * On PS5 the browser cache dir is /user/home/<userid>/webkit/shell.
 *
 * AppCache is per user profile: only the foreground user's browser can
 * fill that profile's cache. This module never wipes another user's
 * files during install; Restore (uninstall) clears the Store origin for
 * every profile after backing each one up. */
#include <dirent.h>
#include <errno.h>
#include <limits.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#include <sqlite3.h>

#include "appcache_clean.h"
#include "files.h"

#define HOME_DIR  "/user/home"
#define SHELL_SUB "/webkit/shell"
#define MAX_DEPTH 4
#define MANIFEST_VER_NAME "manifest_ver"
#define WKAL_DATA_ROOT "/data/wkal"

static int is_db_file(const char *n)
{
    return !strcmp(n, "ApplicationCache.db") ||
           !strcmp(n, "ApplicationCache.db-wal") ||
           !strcmp(n, "ApplicationCache.db-shm") ||
           !strcmp(n, "ApplicationCache.db-journal");
}

static int is_cache_dir(const char *n)
{
    return !strcmp(n, "ApplicationCache") ||
           !strcmp(n, "OfflineWebApplicationCache");
}

static int mkdir_p(const char *path)
{
    char tmp[PATH_MAX];
    size_t len;
    size_t i;

    if (!path || !path[0])
        return -1;
    snprintf(tmp, sizeof(tmp), "%s", path);
    len = strlen(tmp);
    if (len == 0)
        return -1;
    if (tmp[len - 1] == '/')
        tmp[len - 1] = '\0';
    for (i = 1; tmp[i]; i++) {
        if (tmp[i] != '/')
            continue;
        tmp[i] = '\0';
        if (mkdir(tmp, 0777) != 0 && errno != EEXIST)
            return -1;
        tmp[i] = '/';
    }
    if (mkdir(tmp, 0777) != 0 && errno != EEXIST)
        return -1;
    return 0;
}

static int rm_tree(const char *path)
{
    char sub[PATH_MAX];
    struct stat st;
    struct dirent *e;
    DIR *d = opendir(path);
    int n = 0;

    if (!d)
        return 0;
    while ((e = readdir(d))) {
        if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, ".."))
            continue;
        snprintf(sub, sizeof(sub), "%s/%s", path, e->d_name);
        if (lstat(sub, &st))
            continue;
        if (S_ISDIR(st.st_mode))
            n += rm_tree(sub);
        else if (!unlink(sub))
            n++;
    }
    closedir(d);
    if (!rmdir(path))
        n++;
    return n;
}

static int copy_tree(const char *src, const char *dst)
{
    char ssub[PATH_MAX], dsub[PATH_MAX];
    struct stat st;
    struct dirent *e;
    DIR *d;
    int n = 0;

    if (lstat(src, &st))
        return -1;
    if (S_ISDIR(st.st_mode)) {
        if (mkdir_p(dst) != 0)
            return -1;
        d = opendir(src);
        if (!d)
            return -1;
        while ((e = readdir(d))) {
            int k;
            if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, ".."))
                continue;
            snprintf(ssub, sizeof(ssub), "%s/%s", src, e->d_name);
            snprintf(dsub, sizeof(dsub), "%s/%s", dst, e->d_name);
            k = copy_tree(ssub, dsub);
            if (k < 0) {
                closedir(d);
                return -1;
            }
            n += k;
        }
        closedir(d);
        return n;
    }
    if (files_duplicate(src, dst) != 0)
        return -1;
    return 1;
}

/* Find ApplicationCache.db under shell_dir (a few levels deep). */
static int find_db(const char *shell_dir, int depth, char *out, size_t out_sz)
{
    char sub[PATH_MAX];
    struct stat st;
    struct dirent *e;
    DIR *d = opendir(shell_dir);

    if (!d)
        return 0;
    while ((e = readdir(d))) {
        if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, ".."))
            continue;
        snprintf(sub, sizeof(sub), "%s/%s", shell_dir, e->d_name);
        if (lstat(sub, &st))
            continue;
        if (S_ISREG(st.st_mode) && !strcmp(e->d_name, "ApplicationCache.db")) {
            snprintf(out, out_sz, "%s", sub);
            closedir(d);
            return 1;
        }
        if (S_ISDIR(st.st_mode) && depth < MAX_DEPTH) {
            if (find_db(sub, depth + 1, out, out_sz)) {
                closedir(d);
                return 1;
            }
        }
    }
    closedir(d);
    return 0;
}

static void shell_path(char *out, size_t n, const char *userid)
{
    snprintf(out, n, HOME_DIR "/%s" SHELL_SUB, userid);
}

static void backup_path(char *out, size_t n, const char *userid)
{
    snprintf(out, n, APPCACHE_BACKUP_ROOT "/%s", userid);
}

static void ver_path(char *out, size_t n, const char *userid)
{
    snprintf(out, n, APPCACHE_BACKUP_ROOT "/%s/" MANIFEST_VER_NAME, userid);
}

/* Wipe AppCache db sidecars + flat-file dirs under one shell tree. */
static int wipe_files_under(const char *path, int depth, appcache_log_fn log)
{
    char sub[PATH_MAX];
    struct stat st;
    struct dirent *e;
    DIR *d = opendir(path);
    int n = 0;

    if (!d)
        return 0;
    while ((e = readdir(d))) {
        if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, ".."))
            continue;
        snprintf(sub, sizeof(sub), "%s/%s", path, e->d_name);
        if (lstat(sub, &st))
            continue;
        if (S_ISDIR(st.st_mode)) {
            if (is_cache_dir(e->d_name)) {
                int k = rm_tree(sub);
                n += k;
                if (log)
                    log("[WKALI] AppCache: removed dir %s (%d entries)\n", sub, k);
            } else if (depth < MAX_DEPTH) {
                n += wipe_files_under(sub, depth + 1, log);
            }
        } else if (is_db_file(e->d_name)) {
            if (!unlink(sub)) {
                n++;
                if (log)
                    log("[WKALI] AppCache: removed %s (%lld bytes)\n", sub,
                        (long long)st.st_size);
            } else if (log) {
                log("[WKALI] AppCache: could not remove %s\n", sub);
            }
        }
    }
    closedir(d);
    return n;
}

static int exec_sql(sqlite3 *db, const char *sql)
{
    char *errmsg = NULL;
    int rc = sqlite3_exec(db, sql, NULL, NULL, &errmsg);
    if (errmsg)
        sqlite3_free(errmsg);
    return rc == SQLITE_OK ? 0 : -1;
}

/* Delete Store-origin cache groups. Returns rows touched, or -1 on schema miss. */
static int wipe_store_origin_db(const char *db_path, appcache_log_fn log)
{
    sqlite3 *db = NULL;
    sqlite3_stmt *st = NULL;
    int groups = 0;
    int caches = 0;
    char like[128];

    if (sqlite3_open(db_path, &db) != SQLITE_OK) {
        if (log)
            log("[WKALI] AppCache: cannot open %s\n", db_path);
        if (db)
            sqlite3_close(db);
        return -1;
    }
    /* Quick schema probe. */
    if (sqlite3_prepare_v2(db,
            "SELECT id FROM CacheGroups LIMIT 1", -1, &st, NULL) != SQLITE_OK) {
        if (log)
            log("[WKALI] AppCache: cannot read CacheGroups in %s: %s\n",
                db_path, sqlite3_errmsg(db));
        sqlite3_close(db);
        return -1;
    }
    sqlite3_finalize(st);
    st = NULL;

    exec_sql(db, "BEGIN");
    snprintf(like, sizeof(like), "%s/%%", APPCACHE_STORE_ORIGIN);

    /* Collect group ids for our origin / manifest URL prefix. */
    if (sqlite3_prepare_v2(db,
            "SELECT id FROM CacheGroups WHERE origin = ?1 OR origin = ?2 "
            "OR manifestURL LIKE ?3",
            -1, &st, NULL) != SQLITE_OK) {
        exec_sql(db, "ROLLBACK");
        sqlite3_close(db);
        return -1;
    }
    /* WebKit stores origin as http_127.0.0.1_1022; also match URL form. */
    sqlite3_bind_text(st, 1, APPCACHE_STORE_ORIGIN_KEY, -1, SQLITE_STATIC);
    sqlite3_bind_text(st, 2, APPCACHE_STORE_ORIGIN, -1, SQLITE_STATIC);
    sqlite3_bind_text(st, 3, like, -1, SQLITE_STATIC);

    while (sqlite3_step(st) == SQLITE_ROW) {
        sqlite3_int64 gid = sqlite3_column_int64(st, 0);
        sqlite3_stmt *cst = NULL;
        char sql[256];

        groups++;
        /* Delete dependent cache rows (best-effort per table). */
        if (sqlite3_prepare_v2(db,
                "SELECT id FROM Caches WHERE cacheGroup = ?",
                -1, &cst, NULL) == SQLITE_OK) {
            sqlite3_bind_int64(cst, 1, gid);
            while (sqlite3_step(cst) == SQLITE_ROW) {
                sqlite3_int64 cid = sqlite3_column_int64(cst, 0);
                caches++;
                snprintf(sql, sizeof(sql),
                         "DELETE FROM CacheEntries WHERE cache=%lld",
                         (long long)cid);
                exec_sql(db, sql);
                snprintf(sql, sizeof(sql),
                         "DELETE FROM CacheWhitelistURLs WHERE cache=%lld",
                         (long long)cid);
                exec_sql(db, sql);
                snprintf(sql, sizeof(sql),
                         "DELETE FROM CacheAllowsAllNetworkRequests WHERE cache=%lld",
                         (long long)cid);
                exec_sql(db, sql);
                snprintf(sql, sizeof(sql),
                         "DELETE FROM FallbackURLs WHERE cache=%lld",
                         (long long)cid);
                exec_sql(db, sql);
                /* Drop resource blobs tied to this cache via CacheEntries
                 * is already done; leftover CacheResources are harmless. */
                snprintf(sql, sizeof(sql),
                         "DELETE FROM Caches WHERE id=%lld", (long long)cid);
                exec_sql(db, sql);
            }
            sqlite3_finalize(cst);
        }
        snprintf(sql, sizeof(sql),
                 "DELETE FROM CacheGroups WHERE id=%lld", (long long)gid);
        exec_sql(db, sql);
    }
    sqlite3_finalize(st);

    /* Origins quota row for our origin (table may be absent). */
    {
        sqlite3_stmt *ost = NULL;
        if (sqlite3_prepare_v2(db,
                "DELETE FROM Origins WHERE origin = ?1 OR origin = ?2",
                -1, &ost, NULL) == SQLITE_OK) {
            sqlite3_bind_text(ost, 1, APPCACHE_STORE_ORIGIN_KEY, -1, SQLITE_STATIC);
            sqlite3_bind_text(ost, 2, APPCACHE_STORE_ORIGIN, -1, SQLITE_STATIC);
            sqlite3_step(ost);
            sqlite3_finalize(ost);
        }
    }

    exec_sql(db, "COMMIT");
    sqlite3_close(db);
    if (log)
        log("[WKALI] AppCache: selective wipe %s (groups=%d caches=%d)\n",
            db_path, groups, caches);
    return groups + caches;
}

static int backup_one_shell(const char *shell, const char *dest,
                            appcache_log_fn log)
{
    char db[PATH_MAX];
    char src[PATH_MAX];
    char dst[PATH_MAX];
    char parent[PATH_MAX];
    int n = 0;
    int depth;

    if (mkdir_p(dest) != 0) {
        if (log)
            log("[WKALI] AppCache: mkdir backup %s failed\n", dest);
        return -1;
    }
    /* Clear previous backup contents so restore is exact. */
    rm_tree(dest);
    if (mkdir_p(dest) != 0)
        return -1;

    if (!find_db(shell, 0, db, sizeof(db))) {
        if (log)
            log("[WKALI] AppCache: no ApplicationCache.db under %s\n", shell);
        return 0;
    }

    /* Parent of the db (usually .../webkit/shell or a cache subdir). */
    snprintf(parent, sizeof(parent), "%s", db);
    {
        char *slash = strrchr(parent, '/');
        if (slash)
            *slash = '\0';
    }

    /* Copy db + sidecars. */
    {
        static const char *names[] = {
            "ApplicationCache.db",
            "ApplicationCache.db-wal",
            "ApplicationCache.db-shm",
            "ApplicationCache.db-journal",
            NULL
        };
        int i;
        for (i = 0; names[i]; i++) {
            struct stat st;
            snprintf(src, sizeof(src), "%s/%s", parent, names[i]);
            if (stat(src, &st) != 0)
                continue;
            snprintf(dst, sizeof(dst), "%s/%s", dest, names[i]);
            if (files_duplicate(src, dst) == 0)
                n++;
        }
    }

    /* Copy flat-file dirs next to the db and one level under shell. */
    for (depth = 0; depth < 2; depth++) {
        const char *root = depth == 0 ? parent : shell;
        DIR *d = opendir(root);
        struct dirent *e;
        if (!d)
            continue;
        while ((e = readdir(d))) {
            struct stat st;
            int k;
            if (!is_cache_dir(e->d_name))
                continue;
            snprintf(src, sizeof(src), "%s/%s", root, e->d_name);
            if (lstat(src, &st) || !S_ISDIR(st.st_mode))
                continue;
            snprintf(dst, sizeof(dst), "%s/%s", dest, e->d_name);
            k = copy_tree(src, dst);
            if (k > 0)
                n += k;
        }
        closedir(d);
    }

    if (log)
        log("[WKALI] AppCache: backed up %d entries to %s\n", n, dest);
    return n;
}

int appcache_backup_user(const char *userid, appcache_log_fn log)
{
    char shell[PATH_MAX];
    char dest[PATH_MAX];
    struct stat st;

    if (!userid || !userid[0])
        return -1;
    if (mkdir_p(WKAL_DATA_ROOT) != 0 || mkdir_p(APPCACHE_BACKUP_ROOT) != 0)
        return -1;
    shell_path(shell, sizeof(shell), userid);
    if (stat(shell, &st) || !S_ISDIR(st.st_mode)) {
        if (log)
            log("[WKALI] AppCache: no shell dir for user %s\n", userid);
        return 0;
    }
    backup_path(dest, sizeof(dest), userid);
    return backup_one_shell(shell, dest, log);
}

int appcache_restore_user(const char *userid, appcache_log_fn log)
{
    char shell[PATH_MAX];
    char srcdir[PATH_MAX];
    char db_dest_dir[PATH_MAX];
    char src[PATH_MAX];
    char dst[PATH_MAX];
    struct stat st;
    int n = 0;
    DIR *d;
    struct dirent *e;

    if (!userid || !userid[0])
        return -1;
    shell_path(shell, sizeof(shell), userid);
    backup_path(srcdir, sizeof(srcdir), userid);
    if (stat(srcdir, &st) || !S_ISDIR(st.st_mode)) {
        if (log)
            log("[WKALI] AppCache: no backup for user %s\n", userid);
        return -1;
    }
    if (stat(shell, &st) || !S_ISDIR(st.st_mode)) {
        if (mkdir_p(shell) != 0)
            return -1;
    }

    /* Put files back into the shell dir (WebKit finds ApplicationCache.db
     * there). Clear any current AppCache first so restore is clean. */
    wipe_files_under(shell, 0, log);

    /* Prefer restoring beside an existing db location; default to shell. */
    if (!find_db(shell, 0, db_dest_dir, sizeof(db_dest_dir))) {
        snprintf(db_dest_dir, sizeof(db_dest_dir), "%s", shell);
    } else {
        char *slash = strrchr(db_dest_dir, '/');
        if (slash)
            *slash = '\0';
    }

    d = opendir(srcdir);
    if (!d)
        return -1;
    while ((e = readdir(d))) {
        if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, "..") ||
            !strcmp(e->d_name, MANIFEST_VER_NAME))
            continue;
        snprintf(src, sizeof(src), "%s/%s", srcdir, e->d_name);
        if (lstat(src, &st))
            continue;
        snprintf(dst, sizeof(dst), "%s/%s", db_dest_dir, e->d_name);
        if (S_ISDIR(st.st_mode)) {
            int k = copy_tree(src, dst);
            if (k > 0)
                n += k;
        } else if (S_ISREG(st.st_mode)) {
            if (files_duplicate(src, dst) == 0)
                n++;
        }
    }
    closedir(d);
    if (log)
        log("[WKALI] AppCache: restored %d entries for user %s\n", n, userid);
    return n;
}

int appcache_clean_store_user(const char *userid, appcache_log_fn log)
{
    char shell[PATH_MAX];
    char db[PATH_MAX];
    struct stat st;
    int n;

    if (!userid || !userid[0])
        return -1;
    shell_path(shell, sizeof(shell), userid);
    if (stat(shell, &st) || !S_ISDIR(st.st_mode)) {
        if (log)
            log("[WKALI] AppCache: skip missing user %s\n", userid);
        return 0;
    }

    /* Always back up this user before any wipe. */
    appcache_backup_user(userid, log);

    if (find_db(shell, 0, db, sizeof(db))) {
        int k = wipe_store_origin_db(db, log);
        if (k >= 0) {
            /* Drop wal/shm so WebKit reopens a consistent db. */
            char side[PATH_MAX];
            snprintf(side, sizeof(side), "%s-wal", db);
            unlink(side);
            snprintf(side, sizeof(side), "%s-shm", db);
            unlink(side);
            snprintf(side, sizeof(side), "%s-journal", db);
            unlink(side);
            if (log)
                log("[WKALI] AppCache: store-origin clear done for %s\n",
                    userid);
            return k;
        }
    }

    /* Never wipe the whole ApplicationCache.db: other origins (HearBridge
     * etc.) live there too. Leave the cache as is. */
    (void)n;
    if (log)
        log("[WKALI] AppCache: origin delete not possible for %s, cache kept\n",
            userid);
    return 0;
}

int appcache_clean_store_all_users(appcache_log_fn log)
{
    struct dirent *e;
    DIR *d = opendir(HOME_DIR);
    int total = 0, users = 0;

    if (!d) {
        if (log)
            log("[WKALI] AppCache: cannot open " HOME_DIR "\n");
        return 0;
    }
    while ((e = readdir(d))) {
        char shell[PATH_MAX];
        struct stat st;
        int k;
        if (e->d_name[0] == '.')
            continue;
        snprintf(shell, sizeof(shell), HOME_DIR "/%s" SHELL_SUB, e->d_name);
        if (stat(shell, &st) || !S_ISDIR(st.st_mode))
            continue;
        users++;
        k = appcache_clean_store_user(e->d_name, log);
        if (k > 0)
            total += k;
    }
    closedir(d);
    if (log)
        log("[WKALI] AppCache: %d user(s), %d entries cleared (store origin)\n",
            users, total);
    return total;
}

int appcache_clean_all_users(appcache_log_fn log)
{
    return appcache_clean_store_all_users(log);
}

int appcache_manifest_needs_refresh(const char *userid, const char *ver,
                                    appcache_log_fn log)
{
    char path[PATH_MAX];
    char buf[128];
    FILE *fp;
    size_t n;

    if (!userid || !ver)
        return 1;
    ver_path(path, sizeof(path), userid);
    fp = fopen(path, "rb");
    if (!fp) {
        if (log)
            log("[WKALI] AppCache: no manifest_ver for %s -> refresh\n",
                userid);
        return 1;
    }
    n = fread(buf, 1, sizeof(buf) - 1, fp);
    fclose(fp);
    buf[n] = '\0';
    while (n > 0 && (buf[n - 1] == '\n' || buf[n - 1] == '\r' ||
                     buf[n - 1] == ' '))
        buf[--n] = '\0';
    if (strcmp(buf, ver) != 0) {
        if (log)
            log("[WKALI] AppCache: manifest_ver '%s' != '%s' for %s\n",
                buf, ver, userid);
        return 1;
    }
    if (log)
        log("[WKALI] AppCache: manifest_ver matches %s for %s, keep cache\n",
            ver, userid);
    return 0;
}

int appcache_manifest_write_version(const char *userid, const char *ver,
                                    appcache_log_fn log)
{
    char dir[PATH_MAX];
    char path[PATH_MAX];
    FILE *fp;

    if (!userid || !ver)
        return -1;
    if (mkdir_p(WKAL_DATA_ROOT) != 0 || mkdir_p(APPCACHE_BACKUP_ROOT) != 0)
        return -1;
    backup_path(dir, sizeof(dir), userid);
    if (mkdir_p(dir) != 0)
        return -1;
    ver_path(path, sizeof(path), userid);
    fp = fopen(path, "wb");
    if (!fp)
        return -1;
    fprintf(fp, "%s\n", ver);
    fclose(fp);
    if (log)
        log("[WKALI] AppCache: wrote manifest_ver %s for %s\n", ver, userid);
    return 0;
}

/* ---- Clean-console helpers (used by the Clean ELF only) ---- */

int appcache_backup_user_to(const char *userid, const char *dest,
                            appcache_log_fn log)
{
    char shell[PATH_MAX];
    struct stat st;

    if (!userid || !dest)
        return -1;
    shell_path(shell, sizeof(shell), userid);
    if (stat(shell, &st) || !S_ISDIR(st.st_mode))
        return -1;
    /* dest must be new: refuse to overwrite an existing folder. */
    if (stat(dest, &st) == 0) {
        if (log)
            log("[WKCLEAN] backup dest %s exists, refusing\n", dest);
        return -1;
    }
    return backup_one_shell(shell, dest, log);
}

int appcache_clear_store_origin_user(const char *userid, appcache_log_fn log)
{
    char shell[PATH_MAX];
    char db[PATH_MAX];

    if (!userid)
        return -1;
    shell_path(shell, sizeof(shell), userid);
    if (!find_db(shell, 0, db, sizeof(db))) {
        if (log)
            log("[WKCLEAN] no ApplicationCache.db for %s\n", userid);
        return 0;
    }
    /* Origin rows only. No file-level fallback. */
    return wipe_store_origin_db(db, log);
}

int appcache_manifest_clear_version(const char *userid, appcache_log_fn log)
{
    char path[PATH_MAX];
    ver_path(path, sizeof(path), userid);
    if (unlink(path) == 0) {
        if (log)
            log("[WKCLEAN] removed %s\n", path);
        return 1;
    }
    return 0;
}
