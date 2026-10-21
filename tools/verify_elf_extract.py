#!/usr/bin/env python3
"""Extract registry files FROM THE BUILT ELF bytes (not from dist/).
Uses file_registry.c only to learn each blob's bytes/length, locates that exact
blob inside the ELF, then raw-inflates the ELF slice and writes it out."""
import re, sys, zlib, os
reg, elf, out = sys.argv[1:4]
src = open(reg).read(); data = open(elf, 'rb').read()
arrays = {}
for m in re.finditer(r'static const unsigned char (file_\d+)\[\] = \{(.*?)\};', src, re.S):
    arrays[m.group(1)] = bytes(int(x, 16) for x in re.findall(r'0x([0-9a-f]{2})', m.group(2)))
ok = miss = 0
for m in re.finditer(r'\{ "([^"]+)", (file_\d+), (\d+), (\d+), (\d), "', src):
    path, sym, size, orig, comp = m.group(1), m.group(2), int(m.group(3)), int(m.group(4)), int(m.group(5))
    blob = arrays[sym][:size]
    off = data.find(blob)
    if off < 0:
        miss += 1; print('MISSING in ELF:', path); continue
    raw = data[off:off+size]
    body = zlib.decompress(raw, -15) if comp else raw
    assert len(body) == orig, path
    dst = os.path.join(out, path.lstrip('/'))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    open(dst, 'wb').write(body); ok += 1
print(f'extracted {ok} files from ELF, missing {miss}')
