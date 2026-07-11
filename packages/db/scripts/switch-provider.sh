#!/usr/bin/env bash
# Switches packages/db/prisma/schema.prisma's `datasource db` provider
# between "sqlite" (zero-dependency local dev/tests default) and
# "postgresql" (production/Azure). Prisma requires the schema's provider
# to match the protocol of DATABASE_URL (e.g. `file:` for sqlite,
# `postgresql://` for postgres) or CLI commands like `prisma generate`,
# `validate`, `db push` and `migrate` fail with:
#   Error validating datasource `db`: the URL must start with the
#   protocol `file:`.
#
# Usage: switch-provider.sh <sqlite|postgresql>
set -euo pipefail

TARGET="${1:-}"
if [ "$TARGET" != "sqlite" ] && [ "$TARGET" != "postgresql" ]; then
  echo "Usage: $0 <sqlite|postgresql>" >&2
  exit 1
fi

SCHEMA_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/prisma/schema.prisma"

if [ "$TARGET" = "sqlite" ]; then
  OTHER="postgresql"
else
  OTHER="sqlite"
fi

# Tolerate incidental whitespace differences around `=` while only
# matching the datasource provider line.
sed -i.bak -E "s/^([[:space:]]*provider[[:space:]]*=[[:space:]]*)\"${OTHER}\"/\\1\"${TARGET}\"/" "$SCHEMA_PATH"
rm -f "${SCHEMA_PATH}.bak"

if ! grep -qE "^[[:space:]]*provider[[:space:]]*=[[:space:]]*\"${TARGET}\"" "$SCHEMA_PATH"; then
  echo "::error::Failed to switch $SCHEMA_PATH provider to \"$TARGET\" (pattern not found or already set to something else)" >&2
  exit 1
fi

echo "Switched $SCHEMA_PATH datasource provider to \"$TARGET\"."
