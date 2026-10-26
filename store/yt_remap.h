#pragma once

/* Repoint the Store tile (NPXS40047) at the installed YouTube app.
 *
 * Only the launch URI is changed: the tile keeps its Store name and art.
 * Pressing Store then starts YouTube, where the Y2JB payload runs.
 *
 * Returns 0 on success, -1 on failure. Requires a reboot afterwards.
 */
int yt_remap_apply(void);
