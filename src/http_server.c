/* Release tree marker: v1.0.0. */
/*
 * HTTP Server - serves the cached frontend files from the generated file
 * registry and handles the /install route (installs the homescreen app once
 * the cache is complete). The daemon stays up after /install so the UI and
 * home-icon deeplink on :1022 keep working; /exit stops the server.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdatomic.h>
#include <microhttpd.h>

#include "wkali.h"
#ifdef IGNIKEY_STORE
#include "appcache_clean.h"
#endif
#include "http_server.h"
#include "file_registry.h"
#include "inflate.h"
#include "app_installer.h"
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <ifaddrs.h>

/* LAN IP for the UI: SceNetCtl first, getifaddrs fallback (skips 127.x). */
#define WK_NET_CTL_INFO_IP_ADDRESS 14
extern int sceNetCtlGetInfo(int code, void *info);

static void wk_get_lan_ip(char *out, size_t n) {
    union { char ip[16]; unsigned char raw[512]; } info;
    struct ifaddrs *ifa = NULL, *it;
    out[0] = 0;
    memset(&info, 0, sizeof(info));
    if (sceNetCtlGetInfo(WK_NET_CTL_INFO_IP_ADDRESS, &info) == 0) {
        info.ip[15] = 0;
        if (info.ip[0] && strncmp(info.ip, "127.", 4) != 0 && strcmp(info.ip, "0.0.0.0") != 0) {
            snprintf(out, n, "%s", info.ip);
            return;
        }
    }
    if (getifaddrs(&ifa) == 0) {
        for (it = ifa; it; it = it->ifa_next) {
            struct sockaddr_in *sin;
            const char *s;
            if (!it->ifa_addr || it->ifa_addr->sa_family != AF_INET) continue;
            sin = (struct sockaddr_in *)it->ifa_addr;
            s = inet_ntoa(sin->sin_addr);
            if (!s || strncmp(s, "127.", 4) == 0 || strcmp(s, "0.0.0.0") == 0) continue;
            snprintf(out, n, "%s", s);
            break;
        }
        freeifaddrs(ifa);
    }
}

extern int sceKernelGetHwModelName(char *out);

/* Console model (e.g. CFI-1216A); empty on failure. Printable ASCII only. */
static void wk_get_model(char *out, size_t n) {
    char buf[64];
    size_t i, j = 0;
    out[0] = 0;
    memset(buf, 0, sizeof(buf));
    if (sceKernelGetHwModelName(buf) != 0) return;
    buf[sizeof(buf) - 1] = 0;
    for (i = 0; buf[i] && j + 1 < n; i++) {
        unsigned char c = (unsigned char)buf[i];
        if (c >= 0x20 && c < 0x7f && c != '"' && c != '\\') out[j++] = (char)c;
    }
    out[j] = 0;
    while (j > 0 && out[j - 1] == ' ') out[--j] = 0;
}

#ifdef IGNIKEY_STORE
#include "store_remap.h"
#include "store_installer_page.h"
#endif

/* CORS is intentionally `*`: the installer page is also served from the PC
 * host (manuals.playstation.net over HTTPS), which cross-origin XHRs this
 * on-console server (http://127.0.0.1:1022) for /version and
 * /install. The server binds 127.0.0.1 only and lives for seconds.
 * Do not restrict unless that flow changes. */
#define CORS_ORIGIN "*"

/* Shared flag - set to 0 by /exit only; /install keeps :1022 up for home deeplink.
 * atomic so the store in a connection thread is visible to the main loop. */
atomic_int http_keep_running = 1;

/* Set to 1 only when /install succeeds so shutdown knows to notify success. */
atomic_int install_completed = 0;

static void add_cors_headers(struct MHD_Response *resp) {
    MHD_add_response_header(resp, "Access-Control-Allow-Origin", CORS_ORIGIN);
}

static const FileEntry *registry_lookup(const char *url) {
    char path[1024];
    const char *q;
    size_t n;

    if (strcmp(url, ROUTE_INDEX) == 0)
        return file_registry_find(ROUTE_INDEX_HTML);

    /* AppCache manifest lists cache-bust / iframe URLs with ?query. MHD may
     * pass the query in `url`; the registry only stores the bare path. */
    q = strchr(url, '?');
    if (!q)
        return file_registry_find(url);
    n = (size_t)(q - url);
    if (n >= sizeof(path))
        n = sizeof(path) - 1;
    memcpy(path, url, n);
    path[n] = '\0';
    return file_registry_find(path);
}

enum MHD_Result http_on_request(void *cls, struct MHD_Connection *conn,
                                const char *url, const char *method,
                                const char *version, const char *upload_data,
                                size_t *upload_data_size, void **con_cls) {

    (void)cls;
    (void)version;
    (void)upload_data;
    (void)upload_data_size;
    float fw = 0.0f;
    const char *ua = MHD_lookup_connection_value(conn, MHD_HEADER_KIND, "User-Agent");
    if (ua) {
        const char *ps5 = strstr(ua, "PlayStation 5/");
        if (ps5) fw = strtof(ps5 + 14, NULL);
    }

    /* Handle CORS Preflight (OPTIONS) */
    if (strcmp(method, "OPTIONS") == 0) {
        struct MHD_Response *resp =
            MHD_create_response_from_buffer(0, NULL, MHD_RESPMEM_PERSISTENT);
        add_cors_headers(resp);
        MHD_add_response_header(resp, "Access-Control-Allow-Methods",
                                "GET, OPTIONS");
        MHD_add_response_header(resp, "Access-Control-Allow-Headers",
                                "Content-Type");
        enum MHD_Result ret = MHD_queue_response(conn, MHD_HTTP_OK, resp);
        MHD_destroy_response(resp);
        return ret;
    }

    /* ── Initial call for a new request ────────────────────── */
    if (*con_cls == NULL) {
        *con_cls = (void *)1;
        return MHD_YES;
    }

    struct MHD_Response *resp = NULL;
    int http_status = MHD_HTTP_OK;

    if (strcmp(url, ROUTE_INSTALL) == 0) {
        /* Called by the installer page once the AppCache is fully cached. The
         * homescreen app is only installed/updated now - never on startup -
         * so a shortcut is never created for a partial cache. On failure the
         * server stays up and the page tells the user to re-run the installer. */
#ifdef IGNIKEY_STORE
        /* Store build: remap NPXS40047 to TILE_URL instead of a homescreen app. */
        int err = store_remap_apply() < 0 ? -1 : 0;
#else
        int err = wkali_install_app();
#endif
        if (err == 0) {
            /* Keep :1022 up so installer-page can navigate to /app/index.html
             * and the home-icon deeplink works while this ELF is resident.
             * AppCache still enables offline relaunch later; /exit stops us. */
            wkali_log("[WKALI] App installed. Keeping HTTP server on :%d\n",
                      WKALI_PORT);
            resp = MHD_create_response_from_buffer(strlen("OK"), (void *)"OK",
                                                   MHD_RESPMEM_PERSISTENT);
            MHD_add_response_header(resp, "Content-Type", "text/plain");
            http_status = MHD_HTTP_OK;
            atomic_store(&install_completed, 1);
        } else {
            wkali_log("[WKALI] App install failed (%d). Staying up.\n", err);
            const char *fail = "Install failed";
            resp = MHD_create_response_from_buffer(strlen(fail), (void *)fail,
                                                   MHD_RESPMEM_PERSISTENT);
            MHD_add_response_header(resp, "Content-Type", "text/plain");
            http_status = MHD_HTTP_INTERNAL_SERVER_ERROR;
        }
    } else if (strcmp(url, ROUTE_EXIT) == 0) {
        wkali_log("[WKALI] Exit requested by client. Stopping server...\n");
        resp = MHD_create_response_from_buffer(2, (void *)"OK",
                                               MHD_RESPMEM_PERSISTENT);
        MHD_add_response_header(resp, "Content-Type", "text/plain");
        http_status = MHD_HTTP_OK;
        atomic_store(&http_keep_running, 0);
    } else if (strcmp(url, "/app/" WKAL_BASE_VERSION "/__complete__") == 0 ||
               strcmp(url, "/app/" WKAL_FULL_VERSION "/__complete__") == 0) {
        /* Base-version alias: installers may poll /app/1.0.0/__complete__
         * even when the staged tree is /app/1.0.0-dev-... Return the same
         * marker string as the versioned path / /version. */
        resp = MHD_create_response_from_buffer(strlen(WKAL_FULL_VERSION),
                                               (void *)WKAL_FULL_VERSION,
                                               MHD_RESPMEM_PERSISTENT);
        MHD_add_response_header(resp, "Content-Type", "text/plain; charset=utf-8");
        MHD_add_response_header(resp, "Cache-Control", "no-store");
        http_status = MHD_HTTP_OK;
        wkali_log("[HTTP] Serving __complete__ alias for %s -> %s\n", url, WKAL_FULL_VERSION);
    } else if (strcmp(url, ROUTE_VERSION) == 0) {
        resp = MHD_create_response_from_buffer(strlen(WKAL_FULL_VERSION),
                                               (void *)WKAL_FULL_VERSION,
                                               MHD_RESPMEM_PERSISTENT);
        MHD_add_response_header(resp, "Content-Type", "text/plain");
        extern int sceUserServiceGetForegroundUser(int *);
        int uid = -1;
        if (sceUserServiceGetForegroundUser(&uid) == 0 && uid > 0) {
            char uid_hdr[32];
            snprintf(uid_hdr, sizeof(uid_hdr), "%08x", (unsigned int)uid);
            MHD_add_response_header(resp, "X-User-Id", uid_hdr);
        }
    } else if (strcmp(url, "/api/sysinfo") == 0) {
        char model[64], ip[64], body[192];
        wk_get_model(model, sizeof(model));
        wk_get_lan_ip(ip, sizeof(ip));
        snprintf(body, sizeof(body), "{\"model\":\"%s\",\"ip\":\"%s\"}", model, ip);
        resp = MHD_create_response_from_buffer(strlen(body), body, MHD_RESPMEM_MUST_COPY);
        MHD_add_response_header(resp, "Content-Type", "application/json");
        MHD_add_response_header(resp, "Cache-Control", "no-store");
    } else if (strcmp(url, "/api/netinfo") == 0) {
        char ip[64], body[128];
        wk_get_lan_ip(ip, sizeof(ip));
        snprintf(body, sizeof(body), "{\"ip\":\"%s\"}", ip);
        resp = MHD_create_response_from_buffer(strlen(body), body, MHD_RESPMEM_MUST_COPY);
        MHD_add_response_header(resp, "Content-Type", "application/json");
        MHD_add_response_header(resp, "Cache-Control", "no-store");
    } else if (strcmp(url, "/logs") == 0) {
        const char *pos_str = MHD_lookup_connection_value(conn, MHD_GET_ARGUMENT_KIND, "pos");
        size_t pos = 0;
        if (pos_str) pos = (size_t)strtoull(pos_str, NULL, 10);

        char *logs = malloc(16384 + 64);
        if (logs) {
            size_t copied = wkali_wait_logs(&pos, logs, 16384);
            /* Append the new pos as an HTTP header so the client knows */
            resp = MHD_create_response_from_buffer(copied, (void *)logs, MHD_RESPMEM_MUST_FREE);
            char pos_hdr[64];
            snprintf(pos_hdr, sizeof(pos_hdr), "%zu", pos);
            MHD_add_response_header(resp, "X-Log-Pos", pos_hdr);
            MHD_add_response_header(resp, "Content-Type", "text/plain");
        } else {
            const char *oom = "500 Internal Server Error\n";
            resp = MHD_create_response_from_buffer(strlen(oom), (void *)oom, MHD_RESPMEM_PERSISTENT);
        }
#ifdef IGNIKEY_STORE
    } else if (strcmp(url, "/") == 0 || strcmp(url, "/index.html") == 0 ||
               strcmp(url, "/ignikey.html") == 0 ||
               strncmp(url, "/index.html?", 12) == 0) {
        resp = MHD_create_response_from_buffer(sizeof(STORE_INSTALLER_PAGE) - 1,
                                               (void *)STORE_INSTALLER_PAGE,
                                               MHD_RESPMEM_PERSISTENT);
        MHD_add_response_header(resp, "Content-Type", "text/html; charset=utf-8");
        MHD_add_response_header(resp, "Cache-Control", "no-cache, no-store, must-revalidate");
    } else if (strncmp(url, "/cache-fill.html", 16) == 0) {
        resp = MHD_create_response_from_buffer(sizeof(STORE_CACHE_FILL_PAGE) - 1,
                                               (void *)STORE_CACHE_FILL_PAGE,
                                               MHD_RESPMEM_PERSISTENT);
        MHD_add_response_header(resp, "Content-Type", "text/html; charset=utf-8");
        MHD_add_response_header(resp, "Cache-Control", "no-cache");
    } else if (strncmp(url, "/pointer-fill.html", 18) == 0) {
        resp = MHD_create_response_from_buffer(sizeof(STORE_POINTER_FILL_PAGE) - 1,
                                               (void *)STORE_POINTER_FILL_PAGE,
                                               MHD_RESPMEM_PERSISTENT);
        MHD_add_response_header(resp, "Content-Type", "text/html; charset=utf-8");
        MHD_add_response_header(resp, "Cache-Control", "no-cache");
    } else if (strcmp(url, "/wkal-pointer.appcache") == 0) {
        resp = MHD_create_response_from_buffer(sizeof(STORE_POINTER_MANIFEST) - 1,
                                               (void *)STORE_POINTER_MANIFEST,
                                               MHD_RESPMEM_PERSISTENT);
        MHD_add_response_header(resp, "Content-Type", "text/cache-manifest");
        MHD_add_response_header(resp, "Cache-Control", "no-cache");
    } else if (strcmp(url, "/wkal-offline.html") == 0) {
        resp = MHD_create_response_from_buffer(sizeof(STORE_OFFLINE_PAGE) - 1,
                                               (void *)STORE_OFFLINE_PAGE,
                                               MHD_RESPMEM_PERSISTENT);
        MHD_add_response_header(resp, "Content-Type", "text/html; charset=utf-8");
    } else if (strcmp(url, "/wkal-cache-done") == 0) {
        /* Installer signals a full AppCache fill for the foreground user. */
        extern int sceUserServiceGetForegroundUser(int *);
        char *done_body = malloc(32);
        int uid = -1;
        char user[16];
        if (!done_body) {
            const char *oom = "oom\n";
            resp = MHD_create_response_from_buffer(strlen(oom), (void *)oom,
                                                   MHD_RESPMEM_PERSISTENT);
        } else {
            if (sceUserServiceGetForegroundUser(&uid) == 0 && uid > 0) {
                snprintf(user, sizeof(user), "%08x", (unsigned)uid);
                if (appcache_manifest_write_version(user, STORE_VERSION, wkali_log) == 0)
                    snprintf(done_body, 32, "ok\n");
                else
                    snprintf(done_body, 32, "write-failed\n");
            } else {
                snprintf(done_body, 32, "no-user\n");
            }
            resp = MHD_create_response_from_buffer(strlen(done_body), done_body,
                                                   MHD_RESPMEM_MUST_FREE);
            MHD_add_response_header(resp, "Content-Type", "text/plain");
            MHD_add_response_header(resp, "Cache-Control", "no-store");
        }
    } else if (strcmp(url, "/wkal-appcache-restore") == 0) {
        /* Restore this user's AppCache backup. Close the browser after. */
        extern int sceUserServiceGetForegroundUser(int *);
        char *restore_body = malloc(64);
        int uid = -1;
        char user[16];
        int n = -1;
        if (!restore_body) {
            const char *oom = "oom\n";
            resp = MHD_create_response_from_buffer(strlen(oom), (void *)oom,
                                                   MHD_RESPMEM_PERSISTENT);
        } else {
            if (sceUserServiceGetForegroundUser(&uid) == 0 && uid > 0) {
                snprintf(user, sizeof(user), "%08x", (unsigned)uid);
                n = appcache_restore_user(user, wkali_log);
            }
            if (n < 0)
                snprintf(restore_body, 64, "restore-failed\n");
            else
                snprintf(restore_body, 64, "restored %d\n", n);
            resp = MHD_create_response_from_buffer(strlen(restore_body), restore_body,
                                                   MHD_RESPMEM_MUST_FREE);
            MHD_add_response_header(resp, "Content-Type", "text/plain");
            MHD_add_response_header(resp, "Cache-Control", "no-store");
        }
#endif
    } else {
        const FileEntry *entry = registry_lookup(url);
        if (entry) {
            if (strcmp(url, "/") != 0 && strcmp(url, "/index.html") != 0 && strcmp(url, "/logs") != 0) {
                wkali_log("[HTTP] Serving %s (size: %zu)\n", url, entry->size);
            }
            void *payload = (void *)entry->data;
            size_t payload_size = entry->size;
            enum MHD_ResponseMemoryMode mem_mode = MHD_RESPMEM_PERSISTENT;
            unsigned char *decompressed = NULL;

            if (entry->compressed) {
                /* Inflate the raw-DEFLATE blob (src/inflate.c, vendored puff)
                 * into a fresh heap buffer; MHD frees it with MUST_FREE. */
                decompressed = malloc(entry->orig_size);
                if (!decompressed) {
                    const char *oom = "503 Out of Memory\n";
                    resp = MHD_create_response_from_buffer(strlen(oom),
                                                           (void *)oom,
                                                           MHD_RESPMEM_PERSISTENT);
                    MHD_add_response_header(resp, "Content-Type", "text/plain");
                    http_status = MHD_HTTP_SERVICE_UNAVAILABLE;
                    add_cors_headers(resp);
                    enum MHD_Result ret = MHD_queue_response(conn, http_status, resp);
                    MHD_destroy_response(resp);
                    return ret;
                }
                unsigned long destlen = entry->orig_size;
                unsigned long sourcelen = entry->size;
                int err = puff(decompressed, &destlen, entry->data, &sourcelen);
                if (err != 0) {
                    free(decompressed);
                    const char *bad = "500 Inflate Error\n";
                    resp = MHD_create_response_from_buffer(strlen(bad),
                                                           (void *)bad,
                                                           MHD_RESPMEM_PERSISTENT);
                    MHD_add_response_header(resp, "Content-Type", "text/plain");
                    http_status = MHD_HTTP_INTERNAL_SERVER_ERROR;
                    add_cors_headers(resp);
                    enum MHD_Result ret = MHD_queue_response(conn, http_status, resp);
                    MHD_destroy_response(resp);
                    return ret;
                }
                payload = decompressed;
                payload_size = destlen;
                mem_mode = MHD_RESPMEM_MUST_FREE;
            }

            /* Dynamically strip incompatible exploit files from the cache manifest.
               Also when fw == 0: FORCE_EXPLOIT auto plus a UA without
               "PlayStation 5/" used to serve the full manifest. */
            if (strcmp(url, ROUTE_CACHE_MANIFEST) == 0) {
                if (strcmp(WKALI_FORCE_EXPLOIT, "umtx2") == 0) {
                    wkali_log("[WKALI] FORCE_EXPLOIT is set, caching umtx2 exploit\n");
                } else if (strcmp(WKALI_FORCE_EXPLOIT, "poops") == 0) {
                    wkali_log("[WKALI] FORCE_EXPLOIT is set, caching poops exploit\n");
                } else if (strcmp(WKALI_FORCE_EXPLOIT, "p2jb") == 0) {
                    wkali_log("[WKALI] FORCE_EXPLOIT is set, caching p2jb exploit\n");
                } else if (strcmp(WKALI_FORCE_EXPLOIT, "relapse") == 0) {
                    wkali_log("[WKALI] FORCE_EXPLOIT is set, caching relapse exploit\n");
                } else {
                    if (fw <= 0.0f) {
                        wkali_log("[WKALI] Firmware unknown, serving FULL cache manifest\n");
                    } else if (fw <= 5.50f) {
                        wkali_log("[WKALI] Detected firmware %.2f <= 5.50, caching umtx2 exploit\n", fw);
                    } else {
                        wkali_log("[WKALI] Detected firmware %.2f > 5.50, caching relapse exploit\n", fw);
                    }
                }

                char *filtered = malloc(payload_size + 1);
                if (filtered) {
                    char *src = (char *)payload;
                    char *dst = filtered;
                    size_t remaining = payload_size;
                    
                    while (remaining > 0) {
                        char *nl = memchr(src, '\n', remaining);
                        size_t line_len = nl ? (size_t)(nl - src) + 1 : remaining;
                        
                        char line[1024];
                        size_t copy_len = line_len < sizeof(line) ? line_len : sizeof(line) - 1;
                        memcpy(line, src, copy_len);
                        line[copy_len] = '\0';
                        
                        /* Keep only the chain this FW will use - downloading
                           unused trees stalls AppCache near 97% on PS5 WebKit. */
                        int keep = 1;
                        if (strcmp(WKALI_FORCE_EXPLOIT, "umtx2") == 0) {
                            if (strstr(line, "/slopkit/") || strstr(line, "/relapse/")) keep = 0;
                        } else if (strcmp(WKALI_FORCE_EXPLOIT, "poops") == 0
                            || strcmp(WKALI_FORCE_EXPLOIT, "p2jb") == 0) {
                            if (strstr(line, "/umtx2/") || strstr(line, "/relapse/")) keep = 0;
                        } else if (strcmp(WKALI_FORCE_EXPLOIT, "relapse") == 0) {
                            if (strstr(line, "/umtx2/") || strstr(line, "/slopkit/")) keep = 0;
                        } else {
                            /* auto: umtx2 <=5.50, relapse >5.50.
                               fw unknown: keep the FULL manifest so offline
                               cache is complete for any console. */
                            if (fw <= 0.0f) {
                                keep = 1;
                            } else if (fw <= 5.50f) {
                                if (strstr(line, "/slopkit/") || strstr(line, "/relapse/")) keep = 0;
                            } else {
                                if (strstr(line, "/umtx2/") || strstr(line, "/slopkit/")) keep = 0;
                            }
                        }
                        
                        if (keep) {
                            memcpy(dst, src, line_len);
                            dst += line_len;
                        }
                        
                        src += line_len;
                        remaining -= line_len;
                    }
                    
                    if (mem_mode == MHD_RESPMEM_MUST_FREE) free(payload);
                    payload = filtered;
                    payload_size = dst - filtered;
                    mem_mode = MHD_RESPMEM_MUST_FREE;
                }
            }

            resp = MHD_create_response_from_buffer(payload_size, payload,
                                                   mem_mode);
            MHD_add_response_header(resp, "Content-Type", entry->content_type);
            if (strcmp(url, ROUTE_CACHE_MANIFEST) == 0 ||
                strstr(entry->content_type, "cache-manifest") != NULL ||
                strstr(entry->content_type, "text/html") != NULL) {
                MHD_add_response_header(resp, "Cache-Control",
                                        "no-cache, must-revalidate");
            }
        } else {
            const char *not_found = "404 Not Found\n";
            resp = MHD_create_response_from_buffer(strlen(not_found),
                                                   (void *)not_found,
                                                   MHD_RESPMEM_PERSISTENT);
            MHD_add_response_header(resp, "Content-Type", "text/plain");
            http_status = MHD_HTTP_NOT_FOUND;
        }
    }

    if (!resp)
        return MHD_NO;

    add_cors_headers(resp);
    enum MHD_Result ret = MHD_queue_response(conn, http_status, resp);
    MHD_destroy_response(resp);

    return ret;
}
