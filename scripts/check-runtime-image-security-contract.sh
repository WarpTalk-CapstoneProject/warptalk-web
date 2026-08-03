#!/bin/sh
set -eu

repo_root="$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)"
dockerfile="$repo_root/Dockerfile"

grep -Fq 'apk upgrade --no-cache' "$dockerfile" || {
  echo 'frontend runtime image must install current Alpine security updates' >&2
  exit 1
}

grep -Fq 'rm -rf /usr/local/lib/node_modules/npm' "$dockerfile" || {
  echo 'frontend runtime image must remove the unused bundled npm toolchain' >&2
  exit 1
}

echo 'Frontend runtime image security contract: PASS'
