#!/usr/bin/env python3
"""
Generate a C file registry + cache.appcache manifest from a dist directory.

Scans <dist_dir> recursively and produces:
  - <header_out>  : file_registry.h  (FileEntry struct + extern table)
  - <source_out>  : file_registry.c  (byte arrays + lookup function)
  - <dist_dir>/wkal-cache.appcache  (AppCache manifest listing all files)

Usage: gen_file_registry.py <dist_dir> <header_out> <source_out>
"""

import os
import posixpath
import re
import sys
import zlib

from gen_version import get_version_info

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".css": "text/css",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".appcache": "text/cache-manifest",
    ".txt": "text/plain",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".eot": "application/vnd.ms-fontobject",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
}


def detect_content_type(path):
    ext = os.path.splitext(path)[1].lower()
    return CONTENT_TYPES.get(ext, "application/octet-stream")


# slopkit ships its own payload menu servers (ftpsrv, gdbsrv, kstuff, ...) that
# our autoloader never uses - the chains only need the elfldr they boot and
# the kexp shellcode that loads it. poops boots the shared elfldr (served from
# /app/<version>/shared/elfldr-ps5.elf, see tools/download_deps.sh) and p2jb
# is patched onto it too, so only the kexp is kept (both chains use it).
# umtx2 boots its OWN bundled elfldr (kept by
# tools/apply_umtx2_patch.sh at umtx2/payloads/elfldr-ps5.elf, like stock
# umtx2); the rest of its payloads are pruned, and the autoload payload comes
# from /app/<version>/payloads/. readme.png is a slopkit repo asset, also
# unused. The copied slopkit is a throwaway git repo
# (tools/apply_slopkit_patch.sh), so .git must never be embedded. The payload
# digest sidecars (payloads/*.sha256) are build-time bookkeeping and must never
# be served. /VERSION is the staging version handoff (see Makefile) - build-time
# bookkeeping too.
def include_in_registry(path):
    if "/.git/" in path or path.endswith("/.git"):
        return False
    if path == "/VERSION":
        return False
    if "/slopkit/payloads/" in path:
        name = os.path.basename(path)
        return name.startswith("kexp") and name.endswith(".bin")
    if "/slopkit/readme.png" in path:
        return False
    # Relapse: keep elfldr + kexp only (optional R2 payloads are not used by WKAL;
    # autoload ELFs come from /app/<version>/payloads/).
    if "/relapse/payloads/" in path:
        name = os.path.basename(path)
        return name in ("elfldr-ps5-1360.elf", "kexp_2026_05_25.bin") or (
            name.startswith("kexp") and name.endswith(".bin")
        ) or name.startswith("elfldr")
    # Poops is an optional chain (7.00-12.00). Ship with AppCache again.
    if path.endswith(".sha256"):
        return False
    # README / unused SVG icons bloat AppCache and have stalled PS5 WebKit near 97%.
    name = os.path.basename(path.split("?", 1)[0])
    if name.endswith(".md") or name in ("favicon.svg", "logo.svg"):
        return False
    return True


VERSION_PLACEHOLDER = b"[[VERSION_PLACEHOLDER]]"
BUILD_TIME_PLACEHOLDER = b"[[BUILD_TIME_PLACEHOLDER]]"
EXPLOIT_MODE_PLACEHOLDER = b"[[EXPLOIT_MODE]]"
APP_DIR_PLACEHOLDER = b"[[APP_DIR_PLACEHOLDER]]"

# The build-time exploit override in app.js (auto | umtx2 | p2jb | relapse).
# Defaults to "auto" (firmware routing) unless FORCE_EXPLOIT is set.
DEFAULT_EXPLOIT_MODE = "auto"
EXPLOIT_MODES = ("auto", "umtx2", "p2jb", "relapse", "poops")


def get_version_info_with_handoff(dist_dir):
    """Return version_info for the build, preferring the VERSION handoff file
    written by the Makefile staging rule over a freshly computed value.

    The staged app directory lives at /app/<full-version>/, so the version used
    for the directory and the one used to generate the pointer/marker content
    must be identical. Recomputed timestamps (dirty-tree dev builds) could
    straddle a second boundary, so the recipe pins it in dist/VERSION."""
    info = get_version_info()
    try:
        with open(os.path.join(dist_dir, "VERSION"), "r", encoding="utf-8") as f:
            pinned = f.read().strip()
        if pinned:
            info = dict(info)
            info["full"] = pinned
    except OSError:
        pass
    return info


def apply_version_placeholder(path, data, version, build_time, versioned_paths):
    """Replace [[VERSION_PLACEHOLDER]]/[[BUILD_TIME_PLACEHOLDER]] in versioned HTML files."""
    if path in versioned_paths:
        data = data.replace(VERSION_PLACEHOLDER, version.encode("utf-8"))
        data = data.replace(BUILD_TIME_PLACEHOLDER, build_time.encode("utf-8"))
    return data


def apply_pointer_placeholder(path, data, version):
    """Replace the tokens in the stable /app/index.html pointer page. It needs
    the versioned app directory name (for the redirect + marker fetch) and the
    expected marker content, both of which are the full version string."""
    if path == "/app/index.html":
        data = data.replace(APP_DIR_PLACEHOLDER, version.encode("utf-8"))
        data = data.replace(VERSION_PLACEHOLDER, version.encode("utf-8"))
    return data


def apply_exploit_mode_placeholder(path, data, app_dir):
    """Replace the [[EXPLOIT_MODE]] token in app.js from the FORCE_EXPLOIT env."""
    if path == app_dir + "/app.js":
        mode = os.environ.get("FORCE_EXPLOIT", DEFAULT_EXPLOIT_MODE)
        if mode not in EXPLOIT_MODES:
            print(f"Warning: unknown FORCE_EXPLOIT '{mode}' - using 'auto'.", file=sys.stderr)
            mode = "auto"
        data = data.replace(EXPLOIT_MODE_PLACEHOLDER, mode.encode("utf-8"))
    return data


def emit_c_array(out, name, data):
    out.write(f"static const unsigned char {name}[] = {{\n")
    for i in range(0, len(data), 12):
        chunk = ", ".join(f"0x{b:02x}" for b in data[i : i + 12])
        out.write(f"    {chunk},\n")
    out.write("};\n")


# Compress embedded files with raw DEFLATE (no zlib header), matching the
# vendored puff.c inflater in src/inflate.c. This roughly halves the registry
# and keeps the installer ELF small. Files that would not shrink are stored
# uncompressed instead.
def compress_entry(data):
    if len(data) < 64:
        return data, False
    co = zlib.compressobj(level=9, wbits=-15)
    comp = co.compress(data) + co.flush()
    if len(comp) >= len(data):
        return data, False
    return comp, True


# Autoload ELF names the splash choice can select. AppCache matches URLs
# exactly (query included), so every variant must be listed. Keep in sync
# with buildExploitUrls() in frontend/autoloader/app.js.
AUTOLOAD_ELF_NAMES = ("payload.elf", "elf-launcher.elf", "wkal-skip", "wkal-mark.elf", "wkal-companions.elf")


# p2jb (FW 12.02-12.70, force-only): upstream's canonical production query plus
# our autoload key (relaxed in patches/slopkit-autoload.patch). Keep in sync
# with buildExploitUrls() in frontend/autoloader/app.js.
def p2jb_iframe_url(app_dir, autoload="payload.elf"):
    return (
        app_dir + "/slopkit/slopkit/p2jb.html"
        "?go=1&auto=1&production=1&log=debug"
        "&payload=1&autoload=" + autoload + "&v=final"
    )


# umtx2 auto-runs its chain on load via the 'on_load_autorun' sessionStorage
# key set by app.js; the URL carries the autoload payload name + a cache-bust
# that must be bumped together with the umtx2 patch (patches/umtx2-autoload.patch).
# Keep in sync with buildExploitUrls() in frontend/autoloader/app.js.
def umtx2_iframe_url(app_dir, autoload="payload.elf"):
    return app_dir + "/umtx2/index.html?autoload=" + autoload + "&v=1"


# Relapse (FW 7.00-13.60 default): iframe URL carries autoload + fixed cache-bust.
# Keep in sync with buildExploitUrls() in frontend/autoloader/app.js.
def relapse_iframe_url(app_dir, autoload="payload.elf"):
    return app_dir + "/relapse/index.html?autoload=" + autoload + "&v=1"


def poops_iframe_url(app_dir, autoload="payload.elf"):
    return (
        app_dir + "/slopkit/slopkit/poops.html"
        "?go=1&auto=1&production=1&log=debug"
        "&payload=1&autoload=" + autoload + "&v=final"
    )

# slopkit references its own scripts with cache-busting query strings
# (e.g. "./core.js?v=final", "main.js?v=final", "../offsets/9.00.js?v=final").
# AppCache matches URLs exactly, so the manifest must list those query
# variants too or the console falls back and the module imports fail.
CACHEBUST_RE = re.compile(r'([A-Za-z0-9_./-]+\.(?:js|css|html|png|jpg|gif))\?v=[A-Za-z0-9]+')


def collect_cachebust_urls(files):
    """Scan staged HTML/JS for query-string script imports (slopkit's ?v=
    cache-busters) and return their absolute URLs, resolved relative to the
    referencing file. Offsets are loaded dynamically as ../offsets/<fw>.js?v=final
    in main.js, so every offsets file gets the ?v=final variant as well."""
    urls = set()
    for path, full in files:
        try:
            with open(full, "r", encoding="utf-8", errors="replace") as f:
                data = f.read()
        except OSError:
            continue
        base = posixpath.dirname(path)
        for match in CACHEBUST_RE.finditer(data):
            ref, query = match.group(1), match.group(0)[len(match.group(1)):]
            resolved = posixpath.normpath(posixpath.join(base, ref))
            # A referencing page can name a file include_in_registry() dropped
            # (poops.js). AppCache would then stall on the 404.
            if (resolved.startswith("/") and "/slopkit/" in resolved
                    and include_in_registry(resolved)):
                urls.add(resolved + query)
    for path, _ in files:
        if not include_in_registry(path):
            continue
        if "/slopkit/offsets/" in path and path.endswith(".js"):
            urls.add(path + "?v=final")
        # Relapse loads offsets/<fw>.js?v=1 (fixed; see relapse/src/main.js).
        if "/relapse/offsets/" in path and path.endswith(".js"):
            urls.add(path + "?v=1")
    return sorted(urls)


def manifest_omits_unused_tree(path):
    """umtx2 full tree omitted. Slopkit: keep Poops + its JS/offsets deps only."""
    # Payload Manager is no longer offered in the UI; caching its ~2.4MB ELF
    # parked the installer bar around ~71% on PS5 WebKit (byte progress through
    # payloads/pldmgr.elf after payload.elf).
    base0 = path.split("?", 1)[0]
    if base0.endswith("/payloads/pldmgr.elf") or base0.endswith("/payload-manager-icon.jpg"):
        return True
    if "/umtx2/" in path:
        return True
    if "/slopkit/" in path:
        base = path.split("?", 1)[0]
        if base.endswith("/p2jb.html") or "/p2jb." in base:
            return True
        if "/offsets/" in base and base.endswith(".js"):
            return False
        keep_suffixes = (
            "/poops.html", "/poops.js", "/core.js", "/main.js", "/utils.js",
            "/config.js", "/logging.js", "/int64.js", "/rop.js", "/syscalls.js",
            "/module.js", "/patch.js", "/psfree/",
        )
        name = base.rsplit("/", 1)[-1]
        if any(base.endswith(s) for s in keep_suffixes) or name in (
            "poops.html", "poops.js", "core.js", "main.js", "utils.js",
            "config.js", "logging.js", "int64.js", "rop.js", "syscalls.js",
            "module.js", "patch.js",
        ):
            return False
        if "/psfree/" in base:
            return False
        # omit landing page / unused assets
        return True
    # Relapse loads offsets only as offsets/<fw>.js?v=1. Listing the plain path
    # too doubles every offset fetch and slows/stalls the soft 97% window.
    if "?" not in path and "/relapse/offsets/" in path and path.endswith(".js"):
        return True
    return False


def build_manifest(files, version, build_time, app_dir, pointer_path, marker_path):
    """Build the AppCache manifest. Ordering matters for partial-cache safety:
    every versioned file is listed first, then the exploit iframe URLs and the
    slopkit cache-bust variants, then the pointer page, then the __complete__
    marker LAST. The marker being the final entry means a successfully cached
    marker implies the whole versioned directory was downloaded - and the
    pointer (frontend/pointer/index.html) verifies the marker's content before
    redirecting into it."""
    lines = [
        "CACHE MANIFEST",
        f"# WK Autoloader v{version} by X-F1REBALL-X (built {build_time}) - "
        "auto-generated by tools/gen_file_registry.py, do not edit.",
        "",
        "CACHE:",
    ]
    cache_entries = [
        path for path, _ in files
        if path not in (pointer_path, marker_path)
        and not manifest_omits_unused_tree(path)
    ]
    cache_entries.sort()
    lines += cache_entries
    for autoload in AUTOLOAD_ELF_NAMES:
        lines.append(relapse_iframe_url(app_dir, autoload))
        # Poops optional chain (7-12). List iframe URLs for AppCache offline.
        lines.append(poops_iframe_url(app_dir, autoload))
    lines += [
        url for url in collect_cachebust_urls(files)
        if not manifest_omits_unused_tree(url)
    ]
    lines.append(pointer_path)
    lines.append(marker_path)
    lines += [
        "",
        "NETWORK:",
        "/install",
        "/version",
        "/logs",
        "",
        "FALLBACK:",
        "/ /index.html",
    ]

    # Fall back to <dir>/index.html for each subdirectory that has one
    # (e.g. "/app/ /app/index.html" from the pointer, and
    # "/app/<version>/ /app/<version>/index.html"), so cached apps work offline.
    paths = {path for path, _ in files}
    for path in sorted(paths):
        if path == "/index.html" or not path.endswith("/index.html"):
            continue
        if manifest_omits_unused_tree(path):
            continue
        directory = os.path.dirname(path)
        if directory != "/":
            lines.append(f"{directory}/ {path}")

    lines += [""]
    return "\n".join(lines)


def main():
    if len(sys.argv) != 4:
        print("Usage: gen_file_registry.py <dist_dir> <header_out> <source_out>")
        sys.exit(1)

    dist_dir, header_out, source_out = sys.argv[1:4]

    if not os.path.isdir(dist_dir):
        print(f"Error: {dist_dir} not found or not a directory.")
        sys.exit(1)

    version_info = get_version_info_with_handoff(dist_dir)
    version = version_info["full"]
    app_dir = "/app/" + version
    pointer_path = "/app/index.html"
    marker_path = app_dir + "/__complete__"

    # The __complete__ completeness marker lives in the versioned app dir and is
    # listed LAST in the AppCache manifest. Its content is the full version; the
    # pointer page verifies it before redirecting into the directory.
    marker_full = os.path.join(dist_dir, marker_path.lstrip("/"))
    os.makedirs(os.path.dirname(marker_full), exist_ok=True)
    with open(marker_full, "w", encoding="utf-8") as f:
        f.write(version)

    # Files that carry the version/badge and get the placeholders replaced:
    # installer page at the dist root, and the versioned autoloader app index.
    versioned_paths = ("/index.html", app_dir + "/index.html")

    files = []
    for root, dirs, names in os.walk(dist_dir):
        dirs.sort()
        for name in sorted(names):
            if name in ("cache.appcache", "wkal-cache.appcache"):
                continue  # regenerated below
            full = os.path.join(root, name)
            rel = os.path.relpath(full, dist_dir).replace(os.sep, "/")
            if not include_in_registry(f"/{rel}"):
                continue
            files.append((f"/{rel}", full))
    files.sort(key=lambda f: f[0])

    # Write cache.appcache into the dist dir and include it in the registry
    manifest_path = os.path.join(dist_dir, "wkal-cache.appcache")
    with open(manifest_path, "w") as f:
        f.write(build_manifest(files, version, version_info["build_time"],
                               app_dir, pointer_path, marker_path))

    files.append((f"/wkal-cache.appcache", manifest_path))
    files.sort(key=lambda f: f[0])

    # Header
    with open(header_out, "w") as out:
        out.write("/* Auto-generated by tools/gen_file_registry.py - do not edit. */\n")
        out.write("\n")
        out.write("#ifndef FILE_REGISTRY_H\n")
        out.write("#define FILE_REGISTRY_H\n")
        out.write("\n")
        mode = os.environ.get("FORCE_EXPLOIT", DEFAULT_EXPLOIT_MODE)
        if mode not in EXPLOIT_MODES:
            mode = "auto"
        out.write(f'#define WKALI_FORCE_EXPLOIT "{mode}"\n')
        out.write("\n")
        out.write("typedef struct {\n")
        out.write("    const char *path;\n")
        out.write("    const unsigned char *data;\n")
        out.write("    unsigned int size;\n")
        out.write("    unsigned int orig_size;\n")
        out.write("    unsigned char compressed;\n")
        out.write("    const char *content_type;\n")
        out.write("} FileEntry;\n")
        out.write("\n")
        out.write("extern const FileEntry file_registry[];\n")
        out.write("extern const unsigned int file_registry_count;\n")
        out.write("\n")
        out.write("/* Returns a pointer to the entry matching path (e.g. \"/index.html\"), or NULL. */\n")
        out.write("const FileEntry *file_registry_find(const char *path);\n")
        out.write("\n")
        out.write("#endif /* FILE_REGISTRY_H */\n")

    # Source
    with open(source_out, "w") as out:
        out.write("/* Auto-generated by tools/gen_file_registry.py - do not edit. */\n")
        out.write("\n")
        out.write('#include <string.h>\n')
        out.write("\n")
        out.write('#include "file_registry.h"\n')
        out.write("\n")

        entries = []
        for i, (path, full) in enumerate(files):
            with open(full, "rb") as f:
                data = f.read()
            data = apply_version_placeholder(path, data, version,
                                             version_info["build_time"], versioned_paths)
            data = apply_pointer_placeholder(path, data, version)
            data = apply_exploit_mode_placeholder(path, data, app_dir)
            stored, compressed = compress_entry(data)
            emit_c_array(out, f"file_{i}", stored)
            out.write("\n")
            entries.append((path, compressed, len(data), len(stored)))

        out.write("const FileEntry file_registry[] = {\n")
        for i, (path, _) in enumerate(files):
            content_type = detect_content_type(path)
            _, compressed, orig_size, stored_size = entries[i]
            out.write(
                f'    {{ "{path}", file_{i}, {stored_size}, {orig_size}, '
                f'{1 if compressed else 0}, "{content_type}" }},\n'
            )
        out.write("};\n")
        out.write("\n")
        out.write("const unsigned int file_registry_count =\n")
        out.write("    sizeof(file_registry) / sizeof(file_registry[0]);\n")
        out.write("\n")
        out.write("const FileEntry *file_registry_find(const char *path) {\n    const char *q;\n    size_t n;\n    unsigned int i;\n    if (!path)\n        return NULL;\n    q = strchr(path, '?');\n    n = q ? (size_t)(q - path) : strlen(path);\n\n    for (i = 0; i < file_registry_count; i++) {\n        if (strlen(file_registry[i].path) == n &&\n            strncmp(file_registry[i].path, path, n) == 0)\n            return &file_registry[i];\n    }\n\n    return NULL;\n}\n")

    print(f"Generated {header_out} and {source_out} ({len(files)} files, {manifest_path})")


if __name__ == "__main__":
    main()
