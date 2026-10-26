/*
 * WK Store Tile -> YouTube (Y2JB) installer.
 *
 * Send this ELF to elfldr on :9021, wait for the toast, then reboot.
 * Pressing the PlayStation Store tile afterwards starts the installed
 * YouTube app (PPSA0165x), which runs the Y2JB payload.
 *
 * No HTTP server, browser, AppCache or extra homescreen app: this payload
 * only edits the Store tile's launch URI.
 */

#include <signal.h>
#include <sys/syscall.h>
#include <unistd.h>

#include "toast.h"
#include "yt_remap.h"

int main(void)
{
    signal(SIGPIPE, SIG_IGN);
#ifdef SYS_thr_set_name
    syscall(SYS_thr_set_name, -1, "wkal-yt");
#endif

    /* Give elfldr a moment to finish detaching the sender before touching
     * databases that ShellUI may have open. */
    sleep(1);

    return yt_remap_apply() == 0 ? 0 : 1;
}
