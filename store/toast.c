#include <stdarg.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>

#include "toast.h"

struct toast_packet {
  char reserved[45];
  char text[3075];
};

int sceKernelSendNotificationRequest(int device, struct toast_packet *pkt,
                                     size_t size, int blocking);

void toast(const char *fmt, ...) {
  struct toast_packet pkt;
  va_list ap;
  size_t n;

  memset(&pkt, 0, sizeof(pkt));
  va_start(ap, fmt);
  vsnprintf(pkt.text, sizeof(pkt.text) - 1, fmt, ap);
  va_end(ap);

  n = strlen(pkt.text);
  while (n > 0 && pkt.text[n - 1] == '\n') {
    pkt.text[--n] = '\0';
  }

  puts(pkt.text);
  sceKernelSendNotificationRequest(0, &pkt, sizeof(pkt), 0);
}
