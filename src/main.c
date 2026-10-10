/*
 * PS5-WebKit-Autoloader Installer - Main Entry Point
 *
 * This is a native PS5 ELF that starts an HTTP server on :1022, opens the
 * browser to AppCache the UI, installs the homescreen shortcut once the cache
 * is complete (via /install), then keeps serving so the installer can open
 * /app/index.html and the home icon works. /exit (or a newer installer
 * instance) stops the server. Offline AppCache still covers later launches.
 *
 * This file handles: process init, signal setup, MHD lifecycle, shutdown.
 */

/* Release tree marker: v1.0.0. */
#include <errno.h>
#include <fcntl.h>
#include <microhttpd.h>
#include <poll.h>
#include <signal.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/syscall.h>
#include <sys/sysctl.h>
#include <unistd.h>

#include "wkali.h"
#include "http_server.h"
#include "ps5_launcher.h"
#include "app_installer.h"

static pid_t find_pid(const char *name) {
    int mib[4] = {1, 14, 8, 0};
    pid_t mypid = getpid();
    pid_t pid = -1;
    size_t buf_size;
    uint8_t *buf;

    if (sysctl(mib, 4, 0, &buf_size, 0, 0)) {
        wkali_log("[WKALI] sysctl failed\n");
        return -1;
    }

    if (!(buf = malloc(buf_size))) {
        wkali_log("[WKALI] malloc failed\n");
        return -1;
    }

    if (sysctl(mib, 4, buf, &buf_size, 0, 0)) {
        wkali_log("[WKALI] sysctl failed\n");
        free(buf);
        return -1;
    }

    /* KERN_PROC_ALL scan - raw offsets into FreeBSD 12's struct kinfo_proc
     * as exposed by the PS5 kernel: ki_pid at offset 72, ki_tdname at 447
     * (matches the layout used by the ps5-payload-dev SDK's klib). These
     * are ABI-specific; re-check if the kernel struct ever changes. */
    for (uint8_t *ptr = buf; ptr < (buf + buf_size);) {
        int ki_structsize = *(int *)ptr;
        pid_t ki_pid = *(pid_t *)&ptr[72];
        char *ki_tdname = (char *)&ptr[447];

        ptr += ki_structsize;
        if (!strcmp(name, ki_tdname) && ki_pid != mypid) {
            pid = ki_pid;
        }
    }

    free(buf);
    return pid;
}

/* elfldr reads the whole ELF, then detaches this process while the sender
 * socket is still open. stdio is that socket. SLOPKIT is still inside
 * sendPayloadToElfldr (last write or close). Opening the browser in that
 * window kills the jailbreak page and the console crashes.
 *
 * Run before every cache/install flow so the sender has fully detached
 * before the browser is opened. Wait for the sender to hang up, then a
 * short settle so the page can leave its syscall. */
static void wait_for_elf_sender(void) {
    struct pollfd pfd;
    char drain[512];
    int flags;
    int waited_ms = 0;
    const int max_ms = 30000;

    /* Must wait for real EOF (sender closed). A non-blocking read that
     * returns EAGAIN means the socket is still open - keep waiting.
     * The old loop treated EAGAIN like EOF and opened the browser while
     * SLOPKIT was still inside sendPayloadToElfldr (console crash). */
    flags = fcntl(STDIN_FILENO, F_GETFL, 0);
    if (flags != -1)
        fcntl(STDIN_FILENO, F_SETFL, flags | O_NONBLOCK);

    for (;;) {
        pfd.fd = STDIN_FILENO;
        pfd.events = POLLIN | POLLHUP | POLLERR;
        int rc = poll(&pfd, 1, 500);
        if (rc < 0) {
            if (errno == EINTR)
                continue;
            break;
        }

        ssize_t n = read(STDIN_FILENO, drain, sizeof(drain));
        if (n > 0)
            continue;
        if (n == 0)
            break; /* EOF - sender closed */

        if (n < 0 && errno == EINTR)
            continue;
        if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
            if (pfd.revents & (POLLHUP | POLLERR | POLLNVAL))
                break;
            waited_ms += 500;
            if (waited_ms >= max_ms)
                break;
            continue;
        }
        break;
    }

    sleep(1);
}

/* PS5 System Calls (Internal) */
extern int sceNetCtlInit();
extern int sceUserServiceInitialize(void *);
extern int sceUserServiceGetForegroundUser(int *);

__attribute__((used)) volatile const char wkali_version_sig[] =
    "WKALI_VER:" WKAL_FULL_VERSION;

int main(void) {
    struct MHD_Daemon *daemon;
    pid_t pid;

    /* stdout is the sender socket. Once it closes, a log write must not
     * kill us before the browser opens. */
    signal(SIGPIPE, SIG_IGN);

    syscall(SYS_thr_set_name, -1, WKALI_THREAD_NAME);

    /* Kill previous installer instances */
    while ((pid = find_pid(WKALI_THREAD_NAME)) > 0) {
        if (kill(pid, SIGKILL)) {
            wkali_log("[WKALI] kill failed\n");
            return EXIT_FAILURE;
        }
        sleep(1);
    }

    wkali_log("[WKALI] PS5-WebKit-Autoloader Installer v%s by X-F1REBALL-X (built %s) starting on port %d...\n",
                   WKAL_FULL_VERSION, WKAL_BUILD_TIME, WKALI_PORT);

    /* Install the page only when it is missing. An existing page is left as is,
     * and the browser is not opened over it. */
    wait_for_elf_sender();

    /* Initialize PS5 System Services */
    int err;
    if ((err = sceNetCtlInit()) == 0) {
        wkali_log("[WKALI] Network Controller initialized.\n");
    } else {
        wkali_log("[WKALI] sceNetCtlInit failed: 0x%08X\n", err);
    }

    int user_prio = 256;
    if ((err = sceUserServiceInitialize(&user_prio)) == 0) {
        wkali_log("[WKALI] User Service initialized.\n");
    } else {
        wkali_log("[WKALI] sceUserServiceInitialize failed: 0x%08X\n", err);
    }

    /* The homescreen app is installed/updated only AFTER the browser has
     * finished caching (via the /install route), so a shortcut is never
     * created for a partial cache. Nothing app-related happens at startup. */
    signal(SIGPIPE, SIG_IGN);
    signal(SIGHUP, SIG_IGN);
    signal(SIGTERM, SIG_IGN);

    /* Start the MHD daemon using a thread pool to handle concurrent AppCache requests. */
    daemon = MHD_start_daemon(MHD_USE_INTERNAL_POLLING_THREAD | MHD_USE_DEBUG,
                              WKALI_PORT, NULL, NULL, &http_on_request,
                              NULL, 
                              MHD_OPTION_THREAD_POOL_SIZE, (unsigned int)8,
                              MHD_OPTION_END);

    if (NULL == daemon) {
        wkali_log("[WKALI] Failed to start HTTP daemon!\n");
        wkali_notify("Server failed");
        return 1;
    }

    wkali_log("[WKALI] Server running. Waiting for the browser to cache content...\n");

    /* Query foreground user ID to pass to the frontend URL so the UI can
     * display the exact /user/home/<userid>/webkit/shell/ path in prompts. */
    int uid = -1;
    char uid_param[32] = "";
    if (sceUserServiceGetForegroundUser(&uid) == 0 && uid > 0) {
        snprintf(uid_param, sizeof(uid_param), "&uid=%08x", (unsigned int)uid);
    }

    /* Companion homescreen page (Elf Launcher): install when missing.
     * Never autoload unrelated payloads here. */
    wkali_install_companions();

    /* Always open the versioned browser URL and keep the server loop, even when
     * the WK Autoloader page is already on disk — force refresh / reinstall. */

    /* Launch the browser at a versioned URL so the old AppCache master entry
     * for "/" is never served from the previous install. */
    char browser_url[256];
    snprintf(browser_url, sizeof(browser_url),
             "http://127.0.0.1:%d/index.html?v=%s&nocache=1%s", WKALI_PORT, WKAL_FULL_VERSION, uid_param);
    ps5_launch_browser(browser_url);

    /* Main loop - /install installs the homescreen app but keeps :1022 up so
     * the installer can open /app/index.html and the home icon works. Stops
     * only on /exit (or process kill / next installer instance). */
    int install_notified = 0;

    while (atomic_load(&http_keep_running)) {
        if (!install_notified && atomic_load(&install_completed)) {
            install_notified = 1;
            /* Toast already sent from wkali_install_app (Elf Launcher style). */
            wkali_log("[WKALI] Install complete — server stays on :%d for UI/home icon\n",
                      WKALI_PORT);
        }
        usleep(100000); /* 100ms sleep */
    }

    wkali_log_wakeup();

    /* Give the /logs thread half a second to wake up and flush the final logs 
     * over the network before we aggressively kill the MHD daemon and all sockets. */
    usleep(500000); 

    if (daemon)
        MHD_stop_daemon(daemon);

    sleep(1);

    return 0;
}
