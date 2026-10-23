#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

#include "files.h"

int files_make_dir(const char *path) {
  if (mkdir(path, 0777) == 0 || errno == EEXIST) {
    return 0;
  }
  return -1;
}

int files_store(const char *path, const unsigned char *data, size_t len) {
  FILE *fp = fopen(path, "wb");
  size_t done;
  int err;

  if (fp == NULL) {
    return -1;
  }
  done = fwrite(data, 1, len, fp);
  err = fclose(fp);
  return (done == len && err == 0) ? 0 : -1;
}

int files_store_if_changed(const char *path, const unsigned char *data, size_t len) {
  struct stat st;
  FILE *fp;
  unsigned char buf[4096];
  size_t n;
  size_t got;

  if (data == NULL && len != 0)
    return -1;

  if (stat(path, &st) == 0 && (size_t)st.st_size == len) {
    fp = fopen(path, "rb");
    if (fp != NULL) {
      n = len < sizeof(buf) ? len : sizeof(buf);
      got = fread(buf, 1, n, fp);
      if (got == n && memcmp(buf, data, n) == 0) {
        if (len <= n) {
          fclose(fp);
          return 0;
        }
        if (fseek(fp, (long)(len - n), SEEK_SET) == 0) {
          got = fread(buf, 1, n, fp);
          if (got == n && memcmp(buf, data + (len - n), n) == 0) {
            fclose(fp);
            return 0;
          }
        }
      }
      fclose(fp);
    }
  }
  if (files_store(path, data, len) != 0)
    return -1;
  return 1;
}

int files_duplicate(const char *src, const char *dst) {
  unsigned char chunk[8192];
  FILE *in = fopen(src, "rb");
  FILE *out;
  size_t got;
  int ok = 0;

  if (in == NULL) {
    return -1;
  }
  out = fopen(dst, "wb");
  if (out == NULL) {
    fclose(in);
    return -1;
  }
  while ((got = fread(chunk, 1, sizeof(chunk), in)) > 0) {
    if (fwrite(chunk, 1, got, out) != got) {
      ok = -1;
      break;
    }
  }
  if (ferror(in)) {
    ok = -1;
  }
  fclose(in);
  if (fclose(out) != 0) {
    ok = -1;
  }
  return ok;
}
