#pragma once

#include <stddef.h>

/* Patch the main app catalog. Returns rows changed, or -1 on failure.
 * On success, concept_out receives the localConceptId for TILE_ID. */
int tile_edit_app_db(char *concept_out, size_t concept_cap);

/* Patch the secondary appinfo catalog. Returns rows changed, or -1. */
int tile_edit_info_db(const char *concept_id);
