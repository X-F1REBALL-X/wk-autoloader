#pragma once

#include <stddef.h>

/* All helpers return 0 on success and -1 on failure (errno is set),
 * except files_store_if_changed which returns 1 (wrote), 0 (unchanged), -1. */

int files_make_dir(const char *path);

/* Replace the file at path with the given bytes. */
int files_store(const char *path, const unsigned char *data, size_t len);

/* Write only when size or head/tail sample differs.
 * Returns 1 if written, 0 if left unchanged, -1 on error. */
int files_store_if_changed(const char *path, const unsigned char *data, size_t len);

/* Copy src to dst, replacing dst. */
int files_duplicate(const char *src, const char *dst);
