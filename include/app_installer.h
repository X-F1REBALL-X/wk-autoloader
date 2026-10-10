#pragma once

/* 1 when the WK Autoloader homescreen page is already on disk. */
int wkali_page_installed(void);

/* Install (or force-refresh) the WK Autoloader homescreen page: always rewrite
 * param/icon and call install again when already present. */
int wkali_install_app(void);

/* Install Elf Launcher (ELFL00001) homescreen page only when missing.
 * Does not start the server and does not autoload any payloads. */
int wkali_install_companions(void);
