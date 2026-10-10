# WebKit Autoloader Installer - Native PS5 ELF Makefile
# Release tree marker: v1.1.0

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
            -lSceAppInstUtil

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

# Frontend sources — staged into frontend/dist/ before registry generation:
#   installer-page/  → cache/progress entry page at dist root
#   pointer/         → stable /app/index.html entry that redirects into the
#                      versioned app dir after verifying its __complete__ marker
#   autoloader/      → the actual WKAL app, served under /app/<version>/
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


all: $(ELF)

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

# Copy third_party/slopkit -> frontend/autoloader/slopkit and apply our patch.
# The copy is gitignored and regenerated on every build, so the submodule
# stays pristine.
.PHONY: slopkit-prepare
slopkit-prepare:
	@echo "Preparing slopkit copy..."
	./tools/apply_slopkit_patch.sh

# Copy third_party/umtx2/document/en/ps5 -> frontend/autoloader/umtx2 and apply
# our patch. Same pattern as slopkit — pristine submodule, regenerated copy.
.PHONY: umtx2-prepare
umtx2-prepare:
	@echo "Preparing umtx2 copy..."
	./tools/apply_umtx2_patch.sh

# Fetch the shared elfldr + bundled autoload ELFs (Payload Manager + Hybrid Elf tip) from
# their pinned GitHub releases (tools/download_deps.sh). Idempotent: skips when
# the binaries are already present and verified, so offline rebuilds still work.
.PHONY: payload-deps
payload-deps:
	@echo "Fetching shared elfldr + Payload Manager + Elf Launcher tip payloads..."
	./tools/download_deps.sh

$(FILE_REGISTRY_STAMP): $(FRONTEND_FILES) version icons slopkit-prepare umtx2-prepare payload-deps companions
	@echo "Staging frontend into $(FRONTEND_STAGE)/..."
	@V=$$($(PYTHON) tools/gen_version.py --print); \
	rm -rf $(FRONTEND_STAGE) && \
	mkdir -p $(FRONTEND_STAGE)/app/$$V && \
	cp -R $(FRONTEND_INSTALLER_PAGE)/. $(FRONTEND_STAGE)/ && \
	cp -R $(FRONTEND_POINTER)/. $(FRONTEND_STAGE)/app/ && \
	cp -R $(FRONTEND_AUTOLOADER)/. $(FRONTEND_STAGE)/app/$$V/ && \
	echo "$$V" > $(FRONTEND_STAGE)/VERSION
	@echo "Generating file registry from $(FRONTEND_STAGE)/..."
	$(PYTHON) tools/gen_file_registry.py $(FRONTEND_STAGE) $(FILE_REGISTRY_H) $(FILE_REGISTRY_C)
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

$(WKAL_HOST): $(WKAL_HOST_SOURCES) version icons $(HOST_PAYLOAD) slopkit-prepare umtx2-prepare payload-deps
	@echo "Building $(WKAL_HOST) (embedding frontend/autoloader, overrides and the installer ELF)..."
	$(PYTHON) tools/build_host.py --frontend $(FRONTEND_AUTOLOADER) --overrides pc-host/overrides --input pc-host/host.py --output $(WKAL_HOST) --payload $(HOST_PAYLOAD)

host: $(WKAL_HOST)

# Serve the autoloader frontend locally (browser preview) with the same
# /app/ path mapping and version tokens as the real build.
.PHONY: dev
dev: slopkit-prepare umtx2-prepare payload-deps
	$(PYTHON) tools/dev_server.py

# Post-JB companion installer: Elf Launcher + Payload Manager pages only.
COMPANIONS_ELF := frontend/autoloader/payloads/wkal-companions.elf
COMPANIONS_SRCS := src/companions_main.c src/app_installer.c src/notification.c src/log.c

.PHONY: companions
companions: $(COMPANIONS_ELF)

# Companions only need install/notify libs — not libmicrohttpd (installer HTTP).
COMPANIONS_LIBS := -L$(TARGET)/lib -lpthread 	-lSceNetCtl -lSceUserService -lSceSystemService -lSceAppInstUtil

$(COMPANIONS_ELF): $(COMPANIONS_SRCS) include/app_installer.h $(ICON0) assets/companions/elf-launcher/param.json assets/companions/elf-launcher/icon0.png
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

.PHONY: all host dev clean slopkit-prepare umtx2-prepare payload-deps companions
