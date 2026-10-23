#ifndef WK_APPCACHE_CLEAN_H
#define WK_APPCACHE_CLEAN_H
typedef void (*appcache_log_fn)(const char *fmt, ...);
/* Deletes WebKit AppCache storage (ApplicationCache.db + -wal/-shm/-journal
 * and the ApplicationCache flat-file folder) under /user/home/<id>/webkit/shell
 * for every user. Cookies, history, local storage are left alone.
 * Returns the number of entries removed. */
int appcache_clean_all_users(appcache_log_fn log);
#endif
