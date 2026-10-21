#!/usr/bin/env python3
"""Turn a PNG into a C header with a byte array."""

import sys

src, dst, symbol = sys.argv[1], sys.argv[2], sys.argv[3]
raw = open(src, "rb").read()

with open(dst, "w", encoding="utf-8") as out:
    out.write("/* Auto-generated from %s. */\n" % src)
    out.write("static const unsigned char g_%s[] = {\n" % symbol)
    for i in range(0, len(raw), 16):
        part = raw[i:i + 16]
        out.write("    " + ",".join(str(b) for b in part) + ",\n")
    out.write("};\n")
    out.write("static const unsigned int g_%s_len = %d;\n" % (symbol, len(raw)))
