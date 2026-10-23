/* WK Autoloader Store Clean: reset the Store AppCache for a clean-console test.
 *
 * For the foreground user only:
 *   1. copy ApplicationCache.db* to a NEW timestamped folder
 *      /data/wkal/appcache_backup/<userid>_<YYYYmmdd_HHMMSS>/ (older backups kept)
 *   2. delete only the Store origin (http_127.0.0.1_1022) rows from AppCache
 *   3. remove manifest_ver so the next install treats the cache as empty
 * Every step is logged to stdout and /data/wkal/clean_<ts>.log, then it exits. */
#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>

#include "appcache_clean.h"
#include "files.h"
#include "toast.h"

extern int sceUserServiceInitialize(void *);
extern int sceUserServiceGetForegroundUser(int *);

static FILE *g_log;

static void clean_log(const char *fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    vprintf(fmt, ap);
    va_end(ap);
    fflush(stdout);
    if (g_log) {
        va_start(ap, fmt);
        vfprintf(g_log, fmt, ap);
        va_end(ap);
        fflush(g_log);
    }
}

int main(void)
{
    char user[16], stamp[32], dest[256], logpath[256];
    int prio = 256, uid = -1, b, n;
    time_t now = time(NULL);
    struct tm *tm = localtime(&now);

    strftime(stamp, sizeof(stamp), "%Y%m%d_%H%M%S", tm);
    files_make_dir("/data/wkal");
    files_make_dir(APPCACHE_BACKUP_ROOT);
    snprintf(logpath, sizeof(logpath), "/data/wkal/clean_%s.log", stamp);
    g_log = fopen(logpath, "w");

    sceUserServiceInitialize(&prio);
    if (sceUserServiceGetForegroundUser(&uid) != 0 || uid <= 0) {
        clean_log("[WKCLEAN] no foreground user, nothing done\n");
        toast("WK Clean: no user signed in.");
        return 1;
    }
    snprintf(user, sizeof(user), "%08x", (unsigned)uid);
    clean_log("[WKCLEAN] user %s\n", user);

    snprintf(dest, sizeof(dest), APPCACHE_BACKUP_ROOT "/%s_%s", user, stamp);
    b = appcache_backup_user_to(user, dest, clean_log);
    if (b <= 0) {
        clean_log("[WKCLEAN] backup failed (%d), cache NOT touched\n", b);
        toast("WK Clean: backup failed, nothing removed.");
        return 1;
    }
    clean_log("[WKCLEAN] backup %d files -> %s\n", b, dest);

    n = appcache_clear_store_origin_user(user, clean_log);
    if (n < 0) {
        clean_log("[WKCLEAN] origin delete failed, cache kept\n");
        toast("WK Clean: could not remove Store cache.");
        return 1;
    }
    clean_log("[WKCLEAN] removed %d Store AppCache rows\n", n);

    appcache_manifest_clear_version(user, clean_log);
    clean_log("[WKCLEAN] done\n");
    toast("WK Clean: Store cache removed. Backup in %s", dest);
    if (g_log)
        fclose(g_log);
    return 0;
}
