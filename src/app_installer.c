/*
 * PS5 Homescreen App Installer for the WebKit Autoloader Installer.
 * Based on the original implementation in ftpsrv by John Törnblom
 * and Payload Manager by X-F1REBALL-X.
 */

#include <errno.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

#include "app_installer.h"
#include "wkali.h"
#include <ps5/kernel.h>

#define INCASSET(name, file)                                                   \
  __asm__(".section .rodata\n"                                                 \
          ".global " #name "\n"                                                \
          ".global " #name "_end\n"                                            \
          ".global " #name "_size\n"                                           \
          ".align 16\n" #name ":\n"                                            \
          ".incbin \"" file "\"\n" #name "_end:\n" #name "_size:\n"            \
          ".quad " #name "_end - " #name "\n"                                  \
          ".previous\n");                                                      \
  extern const uint8_t name[];                                                 \
  extern const size_t name##_size;

INCASSET(param_json, "assets/param.json");
INCASSET(icon0_png, "assets/icon0.png");
INCASSET(elfl_param_json, "assets/companions/elf-launcher/param.json");
INCASSET(elfl_icon0_png, "assets/companions/elf-launcher/icon0.png");

int sceAppInstUtilInitialize(void);
int sceAppInstUtilTerminate(void);
int sceAppInstUtilAppInstallAll(void *);

/* Path buffers below are built as /user/app/<title_id>/... - title IDs are
 * fixed 9-char strings, so 256 bytes can never truncate. This guard keeps
 * it that way if WKAL_TITLE_ID is ever changed. */
_Static_assert(sizeof(WKAL_TITLE_ID) <= 16, "WKAL_TITLE_ID too long for path buffers");

static int mkdir_p(const char *path, mode_t mode) {
  char tmp[256];
  snprintf(tmp, sizeof(tmp), "%s", path);
  size_t len = strlen(tmp);
  if (len == 0)
    return 0;
  if (tmp[len - 1] == '/')
    tmp[len - 1] = '\0';
  for (char *p = tmp + 1; *p; p++) {
    if (*p == '/') {
      *p = '\0';
      if (mkdir(tmp, mode) != 0 && errno != EEXIST) {
        return -1;
      }
      *p = '/';
    }
  }
  if (mkdir(tmp, mode) != 0 && errno != EEXIST) {
    return -1;
  }
  return 0;
}

static int install_file(const char *path, const uint8_t *data, size_t size) {
  FILE *f;
  if (!(f = fopen(path, "wb"))) {
    return -1;
  }
  if (fwrite(data, size, 1, f) != 1) {
    fclose(f);
    return -1;
  }
  fclose(f);
  return 0;
}

static int install_app(const char *title_id, const char *dir) {
  int (*sceAppInstUtilAppInstallTitleDir)(const char *, const char *, void *) =
      0;
  const char *nid = "Wudg3Xe3heE";
  uint32_t handle;

  if (!kernel_dynlib_handle(-1, "libSceAppInstUtil.sprx", &handle)) {
    sceAppInstUtilAppInstallTitleDir =
        (void *)kernel_dynlib_resolve(-1, handle, nid);
  }

  if (sceAppInstUtilAppInstallTitleDir) {
    return sceAppInstUtilAppInstallTitleDir(title_id, dir, 0);
  }

  return sceAppInstUtilAppInstallAll(0);
}

int wkali_page_installed(void) {
  struct stat st;
  char param_path[256];

  snprintf(param_path, sizeof(param_path), "/user/app/%s/sce_sys/param.json",
           WKAL_TITLE_ID);
  return stat(param_path, &st) == 0 && S_ISREG(st.st_mode);
}

int wkali_install_app(void) {
  const char *title_id = WKAL_TITLE_ID;
  char param_path[256];
  char icon_path[256];

  snprintf(param_path, sizeof(param_path), "/user/app/%s/sce_sys/param.json",
           title_id);
  snprintf(icon_path, sizeof(icon_path), "/user/app/%s/sce_sys/icon0.png",
           title_id);

  if (wkali_page_installed()) {
    wkali_log("[WKALI] Page already present (%s). Reinstalling/updating...\n",
              title_id);
    wkali_notify("Updating WK Autoloader...");
  } else {
    wkali_log("[WKALI] Installing browser launcher app (%s)...\n", title_id);
    wkali_notify("Installing WK Autoloader...");
  }

  int err;
  if ((err = sceAppInstUtilInitialize())) {
    wkali_log("[WKALI] sceAppInstUtilInitialize: error 0x%08X\n", err);
    return -1;
  }

  char sce_sys_dir[256];
  snprintf(sce_sys_dir, sizeof(sce_sys_dir), "/user/app/%s/sce_sys", title_id);
  if (mkdir_p(sce_sys_dir, 0755) != 0) {
    wkali_log("[WKALI] Failed to create app dir: %s (errno: %d)\n",
              sce_sys_dir, errno);
    sceAppInstUtilTerminate();
    return -1;
  }

  if (install_file(param_path, param_json, param_json_size)) {
    wkali_log("[WKALI] Failed to install param.json\n");
    sceAppInstUtilTerminate();
    return -1;
  }

  if (install_file(icon_path, icon0_png, icon0_png_size)) {
    wkali_log("[WKALI] Failed to install icon0.png\n");
    sceAppInstUtilTerminate();
    return -1;
  }

  if ((err = install_app(title_id, "/user/app/"))) {
    wkali_log("[WKALI] install_app: error 0x%08X\n", err);
    sceAppInstUtilTerminate();
    return -1;
  }

  wkali_log("[WKALI] Launcher app installed successfully.\n");
  wkali_notify("WK Autoloader Ready!");

  sceAppInstUtilTerminate();
  return 0;
}

static int title_installed(const char *title_id) {
  struct stat st;
  char param_path[256];

  snprintf(param_path, sizeof(param_path), "/user/app/%s/sce_sys/param.json",
           title_id);
  return stat(param_path, &st) == 0 && S_ISREG(st.st_mode);
}

static int install_title_if_missing(const char *title_id, const char *label,
                                    const uint8_t *param, size_t param_size,
                                    const uint8_t *icon, size_t icon_size) {
  char param_path[256];
  char icon_path[256];
  char sce_sys_dir[256];
  int err;

  if (title_installed(title_id)) {
    wkali_log("[WKALI] %s already installed (%s). Not installing again.\n",
              label, title_id);
    return 0;
  }

  wkali_log("[WKALI] Installing %s (%s)...\n", label, title_id);
  wkali_notify("Installing %s...", label);

  if ((err = sceAppInstUtilInitialize())) {
    wkali_log("[WKALI] sceAppInstUtilInitialize: error 0x%08X\n", err);
    return -1;
  }

  snprintf(sce_sys_dir, sizeof(sce_sys_dir), "/user/app/%s/sce_sys", title_id);
  if (mkdir_p(sce_sys_dir, 0755) != 0) {
    wkali_log("[WKALI] Failed to create app dir: %s (errno: %d)\n",
              sce_sys_dir, errno);
    sceAppInstUtilTerminate();
    return -1;
  }

  snprintf(param_path, sizeof(param_path), "/user/app/%s/sce_sys/param.json",
           title_id);
  snprintf(icon_path, sizeof(icon_path), "/user/app/%s/sce_sys/icon0.png",
           title_id);

  if (install_file(param_path, param, param_size)) {
    wkali_log("[WKALI] Failed to install %s param.json\n", label);
    sceAppInstUtilTerminate();
    return -1;
  }

  if (install_file(icon_path, icon, icon_size)) {
    wkali_log("[WKALI] Failed to install %s icon0.png\n", label);
    sceAppInstUtilTerminate();
    return -1;
  }

  if ((err = install_app(title_id, "/user/app/"))) {
    wkali_log("[WKALI] install_app %s: error 0x%08X\n", label, err);
    sceAppInstUtilTerminate();
    return -1;
  }

  wkali_log("[WKALI] %s installed successfully.\n", label);
  wkali_notify("%s Ready!", label);
  sceAppInstUtilTerminate();
  return 0;
}

int wkali_install_companions(void) {
  int rc = 0;

  /* Elf Launcher homescreen page only. Never autoload payloads. */
  if (install_title_if_missing("ELFL00001", "Elf Launcher", elfl_param_json,
                               elfl_param_json_size, elfl_icon0_png,
                               elfl_icon0_png_size))
    rc = -1;
  return rc;
}
