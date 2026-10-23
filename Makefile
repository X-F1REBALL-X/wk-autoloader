# WebKit Autoloader Installer - Native PS5 ELF Makefile
# Release tree marker: v1.0.0

# Tools
PYTHON := python3
# Override with: make SDK=/path/to/ps5-payload-sdk
SDK    ?= /opt/ps5-payload-sdk
CC     := $(SDK)/bin/prospero-clang
STRIP  := $(SDK)/bin/prospero-strip

# Paths
TARGET   := $(SDK)/target
INCLUDES := -Iinclude -I$(TARGET)/include
LIBS     := $(TARGET)/lib/libmicrohttpd.a \
            -L$(TARGET)/lib -lpthread \
            -lSceNetCtl -lSceUserService -lSceSystemService \
            -lSceAppInstUtil -lkernel_sys

# Source Files
SRCS := src/main.c src/http_server.c src/app_installer.c \
        src/notification.c src/ps5_launcher.c src/log.c src/inflate.c
ELF := installer.elf

# Generated file registry
FILE_REGISTRY_H := include/file_registry.h
FILE_REGISTRY_C := include/file_registry.c
FILE_REGISTRY_STAMP := include/.file_registry.stamp

# Generated version header (stable = base version, dev = + hash/timestamp suffix, see tools/gen_version.py)
VERSION_HEADER := include/wkali_version.h

# Frontend sources - staged into frontend/dist/ before registry generation:
#   installer-page/  -> cache/progress entry page at dist root
#   pointer/         -> stable /app/index.html entry that redirects into the
#                      versioned app dir after verifying its __complete__ marker
#   autoloader/      -> the actual WKAL app, served under /app/<version>/
FRONTEND_INSTALLER_PAGE := frontend/installer-page
FRONTEND_POINTER := frontend/pointer
FRONTEND_AUTOLOADER := frontend/autoloader
FRONTEND_STAGE := frontend/dist
FRONTEND_FILES := $(shell find $(FRONTEND_INSTALLER_PAGE) $(FRONTEND_POINTER) $(FRONTEND_AUTOLOADER) -type f 2>/dev/null)

# Generated icon assets (master: assets/icon.svg, see tools/gen_icons.py)
ICON_MASTER := assets/icon.svg
ICON0 := assets/icon0.png
ICON_ICO := assets/icon.ico
FAVICON_INSTALLER := $(FRONTEND_INSTALLER_PAGE)/favicon.svg
FAVICON_AUTOLOADER := $(FRONTEND_AUTOLOADER)/favicon.svg
LOGO_INSTALLER := $(FRONTEND_INSTALLER_PAGE)/logo.svg
LOGO_AUTOLOADER := $(FRONTEND_AUTOLOADER)/logo.svg

# Standalone PC host script (webkit-autoloader-host.py) with the autoloader embedded
WKAL_HOST := webkit-autoloader-host.py
WKAL_HOST_SOURCES := pc-host/host.py $(FRONTEND_FILES)

# Compiler Flags
CFLAGS  := -Os -Wall -ffunction-sections -fdata-sections $(INCLUDES)
LDFLAGS := -Wl,--gc-sections


# Default target: the Store-tile build (IgniKey-$(VERSION).elf).
all: store

# Legacy homescreen installer (not the IgniKey release).
homescreen: $(ELF)

# Regenerate the version header on every build (cheap, only rewrites on change)
.PHONY: version print-version icons
version:
	$(PYTHON) tools/gen_version.py

print-version:
	@$(PYTHON) tools/gen_version.py --print

# Regenerate all derived icon assets (homescreen icon, .ico, favicons, logos)
icons: $(ICON0) $(ICON_ICO) $(FAVICON_INSTALLER) $(FAVICON_AUTOLOADER) $(LOGO_INSTALLER) $(LOGO_AUTOLOADER)

$(ICON0) $(ICON_ICO) $(FAVICON_INSTALLER) $(FAVICON_AUTOLOADER) $(LOGO_INSTALLER) $(LOGO_AUTOLOADER): $(ICON_MASTER) tools/gen_icons.py
	@echo "Generating icon assets from $(ICON_MASTER)..."
	$(PYTHON) tools/gen_icons.py

$(FILE_REGISTRY_H) $(FILE_REGISTRY_C): $(FILE_REGISTRY_STAMP)

# Fetch the shared elfldr + bundled autoload ELFs (Payload Manager + Hybrid Elf tip) from
# their pinned GitHub releases (tools/download_deps.sh). Idempotent: skips when
# the binaries are already present and verified, so offline rebuilds still work.
.PHONY: payload-deps
payload-deps:
	@echo "Fetching shared elfldr + Payload Manager + Elf Launcher tip payloads..."
	./tools/download_deps.sh

$(FILE_REGISTRY_STAMP): $(FRONTEND_FILES) version icons payload-deps companions
	@echo "Staging frontend into $(FRONTEND_STAGE)/..."
	@V=$$($(PYTHON) tools/gen_version.py --print); \
	rm -rf $(FRONTEND_STAGE) && \
	mkdir -p $(FRONTEND_STAGE)/app/$$V && \
	cp -R $(FRONTEND_INSTALLER_PAGE)/. $(FRONTEND_STAGE)/ && \
	cp -R $(FRONTEND_POINTER)/. $(FRONTEND_STAGE)/app/ && \
	cp -R $(FRONTEND_AUTOLOADER)/. $(FRONTEND_STAGE)/app/$$V/ && \
	echo "$$V" > $(FRONTEND_STAGE)/VERSION
	@echo "Generating file registry from $(FRONTEND_STAGE)/..."
	STORE_VERSION=$(STORE_VERSION) $(PYTHON) tools/gen_file_registry.py $(FRONTEND_STAGE) $(FILE_REGISTRY_H) $(FILE_REGISTRY_C)
	@touch $(FILE_REGISTRY_STAMP)

$(ELF): $(FILE_REGISTRY_H) $(FILE_REGISTRY_C) $(SRCS) $(ICON0)
	@echo "Building $(ELF)..."
	$(CC) $(CFLAGS) $(LDFLAGS) -o $(ELF) $(SRCS) $(FILE_REGISTRY_C) $(LIBS)
	@echo "Stripping $(ELF)..."
	$(STRIP) $(ELF)

# The PC host is the one-time setup flow: it serves the installer ELF (the
# homescreen-app installer) instead of the bundled unified-autoloader payload.
# HOST_PAYLOAD overrides the payload path (build_release.sh passes the
# versioned ELF it already built); it defaults to $(ELF).
HOST_PAYLOAD ?= $(ELF)

$(WKAL_HOST): $(WKAL_HOST_SOURCES) version icons $(HOST_PAYLOAD) payload-deps
	@echo "Building $(WKAL_HOST) (embedding frontend/autoloader, overrides and the installer ELF)..."
	$(PYTHON) tools/build_host.py --frontend $(FRONTEND_AUTOLOADER) --overrides pc-host/overrides --input pc-host/host.py --output $(WKAL_HOST) --payload $(HOST_PAYLOAD)

host: $(WKAL_HOST)

# Serve the autoloader frontend locally (browser preview) with the same
# /app/ path mapping and version tokens as the real build.
.PHONY: dev
dev: payload-deps
	$(PYTHON) tools/dev_server.py

# Post-JB companion installer: Elf Launcher + Payload Manager pages only.
COMPANIONS_ELF := frontend/autoloader/payloads/wkal-companions.elf
COMPANIONS_SRCS := src/companions_main.c src/app_installer.c src/notification.c src/log.c

.PHONY: companions
companions: $(COMPANIONS_ELF)

# Companions only need install/notify libs - not libmicrohttpd (installer HTTP).
COMPANIONS_LIBS := -L$(TARGET)/lib -lpthread 	-lSceNetCtl -lSceUserService -lSceSystemService -lSceAppInstUtil

$(COMPANIONS_ELF): $(COMPANIONS_SRCS) include/app_installer.h $(ICON0) assets/companions/elf-launcher/param.json assets/companions/elf-launcher/icon0.png assets/companions/payload-manager/param.json assets/companions/payload-manager/icon0.png
	@echo "Building $(COMPANIONS_ELF)..."
	@mkdir -p $(dir $(COMPANIONS_ELF))
	$(CC) $(CFLAGS) $(LDFLAGS) -o $(COMPANIONS_ELF) $(COMPANIONS_SRCS) $(COMPANIONS_LIBS)
	$(STRIP) $(COMPANIONS_ELF)
	@sha256sum $(COMPANIONS_ELF) | awk '{print "wkal-companions " $$1}' > $(COMPANIONS_ELF).sha256
	@echo "Built $(COMPANIONS_ELF) ($$(wc -c < $(COMPANIONS_ELF)) bytes)"

clean:
	rm -rf $(FRONTEND_STAGE)
	rm -f $(ELF) $(FILE_REGISTRY_H) $(FILE_REGISTRY_C) $(FILE_REGISTRY_STAMP)
	rm -f $(WKAL_HOST) $(VERSION_HEADER)
	rm -rf $(STORE_GEN) $(STORE_ELF) WK_Autoloader_Store_Restore_V1.1.6.elf

.PHONY: all host dev clean payload-deps companions

# ---------------------------------------------------------------------------
# Store build (store-only installer): remaps the PS5 Store tile (NPXS40047)
# to http://127.0.0.1:1022/app/index.html and serves the Midnight UI on :1022.
# store/restore_main.c is the separate restore payload and is not linked here.
STORE_DIR   := store
STORE_GEN   := $(STORE_DIR)/build
STORE_SRCS  := $(STORE_DIR)/store_remap.c $(STORE_DIR)/tile_edit.c \
               $(STORE_DIR)/files.c $(STORE_DIR)/toast.c \
               $(STORE_DIR)/appcache_clean.c
SQLITE_SRC  := $(STORE_DIR)/third_party/sqlite3.c
SQLITE_FLAGS := -DSQLITE_THREADSAFE=0 -DSQLITE_OMIT_LOAD_EXTENSION \
                -DSQLITE_OMIT_WAL -DSQLITE_DEFAULT_MEMSTATUS=0 -w
STORE_VERSION := 1.1.6
STORE_ELF   := WK_Autoloader_Store_V1.1.6.elf
STORE_CFLAGS := $(CFLAGS) -DIGNIKEY_STORE -DSTORE_VERSION='"$(STORE_VERSION)"' -I$(STORE_DIR) -I$(STORE_GEN) \
                -I$(STORE_DIR)/third_party

.PHONY: store
store: $(STORE_ELF)

$(STORE_GEN)/icon_png.h: $(STORE_DIR)/icon0.png $(STORE_DIR)/tools/embed_png.py
	@mkdir -p $(STORE_GEN)
	$(PYTHON) $(STORE_DIR)/tools/embed_png.py $< $@ icon_png

$(STORE_GEN)/pic0_png.h: $(STORE_DIR)/pic0.png $(STORE_DIR)/tools/embed_png.py
	@mkdir -p $(STORE_GEN)
	$(PYTHON) $(STORE_DIR)/tools/embed_png.py $< $@ pic0_png

$(STORE_GEN)/sqlite3.o: $(SQLITE_SRC)
	@mkdir -p $(STORE_GEN)
	$(CC) -Os -ffunction-sections -fdata-sections -I$(TARGET)/include $(SQLITE_FLAGS) -c -o $@ $<

$(STORE_ELF): $(FILE_REGISTRY_H) $(FILE_REGISTRY_C) $(SRCS) $(STORE_SRCS) \
              $(STORE_GEN)/icon_png.h $(STORE_GEN)/pic0_png.h $(STORE_GEN)/sqlite3.o \
              $(STORE_DIR)/config.h $(STORE_DIR)/store_installer_page.h
	@echo "Building $(STORE_ELF) (Store tile NPXS40047 -> :1022/app/index.html)..."
	$(CC) $(STORE_CFLAGS) $(LDFLAGS) -o $@ $(SRCS) $(STORE_SRCS) $(FILE_REGISTRY_C) \
		$(STORE_GEN)/sqlite3.o $(LIBS)
	$(STRIP) $@

# Full Store restore: undoes NPXS40047 remap (backup or built-in stock).
# Send to elfldr :9021, then reboot. Not linked into the Store installer ELF.
RESTORE_ELF := WK_Autoloader_Store_Restore_V1.1.6.elf
.PHONY: restore
restore: $(RESTORE_ELF)

$(RESTORE_ELF): $(STORE_DIR)/restore_main.c $(STORE_DIR)/toast.c $(STORE_DIR)/files.c \
                $(STORE_DIR)/appcache_clean.c \
                $(STORE_GEN)/sqlite3.o $(STORE_DIR)/config.h
	@mkdir -p $(STORE_GEN)
	@echo "Building $(RESTORE_ELF) (restore PS Store tile)..."
	$(CC) $(STORE_CFLAGS) $(LDFLAGS) -o $@ \
		$(STORE_DIR)/restore_main.c $(STORE_DIR)/toast.c $(STORE_DIR)/files.c \
		$(STORE_DIR)/appcache_clean.c \
		$(STORE_GEN)/sqlite3.o $(LIBS)
	$(STRIP) $@

# Clean-console test: back up, drop Store AppCache origin, clear manifest_ver.
CLEAN_ELF := WK_Autoloader_Store_Clean_V$(STORE_VERSION).elf
.PHONY: clean-elf
clean-elf: $(CLEAN_ELF)

# WebKit keeps ApplicationCache.db in WAL mode, so this ELF needs a
# SQLite build with WAL support (the shared one omits it).
$(STORE_GEN)/sqlite3_wal.o: $(SQLITE_SRC)
	@mkdir -p $(STORE_GEN)
	$(CC) -Os -ffunction-sections -fdata-sections -I$(TARGET)/include \
		-DSQLITE_THREADSAFE=0 -DSQLITE_OMIT_LOAD_EXTENSION -DSQLITE_DEFAULT_MEMSTATUS=0 -w -c -o $@ $<

$(CLEAN_ELF): $(STORE_DIR)/clean_main.c $(STORE_DIR)/toast.c $(STORE_DIR)/files.c \
              $(STORE_DIR)/appcache_clean.c $(STORE_GEN)/sqlite3_wal.o
	@echo "Building $(CLEAN_ELF)..."
	$(CC) $(STORE_CFLAGS) $(LDFLAGS) -o $@ \
		$(STORE_DIR)/clean_main.c $(STORE_DIR)/toast.c $(STORE_DIR)/files.c \
		$(STORE_DIR)/appcache_clean.c $(STORE_GEN)/sqlite3_wal.o $(LIBS)
	$(STRIP) $@
