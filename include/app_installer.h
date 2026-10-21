#pragma once

/* 1 when the WK Autoloader homescreen page is already on disk. */
int wkali_page_installed(void);

/* Install (or force-refresh) the WK Autoloader homescreen page: always rewrite
 * param/icon and call install again when already present. */
int wkali_install_app(void);

/* Install Elf Launcher (ELFL00001) and Payload Manager (PLDM00001)
 * homescreen pages when missing. Does not start servers or autoload. */
int wkali_install_companions(void);
