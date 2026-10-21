#pragma once

#include <stddef.h>

/* All helpers return 0 on success and -1 on failure (errno is set). */

/* Create a directory; succeeds if it already exists. */
int files_make_dir(const char *path);

/* Replace the file at path with the given bytes. */
int files_store(const char *path, const unsigned char *data, size_t len);

/* Copy src to dst, replacing dst. */
int files_duplicate(const char *src, const char *dst);
