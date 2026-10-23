/* Remove stale WebKit AppCache data so a fresh install really re-caches.
 *
 * WebKit keeps the AppCache in <cache dir>/ApplicationCache.db (sqlite) and
 * stores large resources as flat files in <cache dir>/ApplicationCache/.
 * On PS5 the browser cache dir is /user/home/<userid>/webkit/shell (the same
 * folder ps5-webkit-cache-remover wipes completely). We only drop the AppCache
 * files there, searched a few levels deep, and keep everything else. */
#include <dirent.h>
#include <limits.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#include "appcache_clean.h"

#define HOME_DIR  "/user/home"
#define SHELL_SUB "/webkit/shell"
#define MAX_DEPTH 4

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

static int scan(const char *path, int depth, appcache_log_fn log)
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
                n += scan(sub, depth + 1, log);
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

int appcache_clean_all_users(appcache_log_fn log)
{
    char shell[PATH_MAX];
    struct stat st;
    struct dirent *e;
    DIR *d = opendir(HOME_DIR);
    int total = 0, users = 0;
    if (!d) {
        if (log)
            log("[WKALI] AppCache: cannot open " HOME_DIR "\n");
        return 0;
    }
    while ((e = readdir(d))) {
        if (e->d_name[0] == '.')
            continue;
        snprintf(shell, sizeof(shell), HOME_DIR "/%s" SHELL_SUB, e->d_name);
        if (stat(shell, &st) || !S_ISDIR(st.st_mode))
            continue;
        users++;
        total += scan(shell, 0, log);
    }
    closedir(d);
    if (log)
        log("[WKALI] AppCache: %d user cache dir(s) checked, %d entries removed\n",
            users, total);
    return total;
}
