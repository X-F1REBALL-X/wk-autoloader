#ifndef WK_APPCACHE_CLEAN_H
#define WK_APPCACHE_CLEAN_H

typedef void (*appcache_log_fn)(const char *fmt, ...);

/* Store origin served by the installer on :1022. AppCache groups for this
 * origin are the only ones we remove on a selective wipe.
 * WebKit Origins.origin uses underscores (http_127.0.0.1_1022); manifestURL
 * keeps the normal URL form. Match both. */
#define APPCACHE_STORE_ORIGIN "http://127.0.0.1:1022"
#define APPCACHE_STORE_ORIGIN_KEY "http_127.0.0.1_1022"

/* Per-user backups live under /data/wkal/appcache_backup/<userid>/. */
#define APPCACHE_BACKUP_ROOT "/data/wkal/appcache_backup"

/* Backup ApplicationCache.db* and the ApplicationCache/ folder for one
 * user id (folder name under /user/home). Returns entries copied, or -1. */
int appcache_backup_user(const char *userid, appcache_log_fn log);

/* Restore a previous backup for one user. Browser should be closed.
 * Returns entries restored, or -1. */
int appcache_restore_user(const char *userid, appcache_log_fn log);

/* Clear only the Store AppCache for one user (backup first). Tries a
 * selective SQLite delete by origin; falls back to wiping that user's
 * AppCache files only. Never touches other users. Returns entries removed. */
int appcache_clean_store_user(const char *userid, appcache_log_fn log);

/* Backup + clear Store AppCache for every profile that has a webkit/shell
 * dir. Used by the Restore (uninstall) ELF only. */
int appcache_clean_store_all_users(appcache_log_fn log);

/* Legacy name: same as appcache_clean_store_all_users. */
int appcache_clean_all_users(appcache_log_fn log);

/* 1 if this user has no saved manifest version or it differs from ver. */
int appcache_manifest_needs_refresh(const char *userid, const char *ver,
                                    appcache_log_fn log);

/* Record the manifest version after a successful offline cache fill. */
int appcache_manifest_write_version(const char *userid, const char *ver,
                                    appcache_log_fn log);

/* Clean ELF: backup into a new folder (never overwrites), drop only the
 * Store origin rows, and forget the saved manifest version. */
int appcache_backup_user_to(const char *userid, const char *dest,
                            appcache_log_fn log);
int appcache_clear_store_origin_user(const char *userid, appcache_log_fn log);
int appcache_manifest_clear_version(const char *userid, appcache_log_fn log);

#endif
