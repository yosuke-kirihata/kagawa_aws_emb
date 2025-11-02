#!/bin/zsh
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: ./upload-sample.sh <SIGNED_URL>" >&2
  exit 1
fi

SIGNED_URL="$1"
SCRIPT_DIR="$(cd -- "$(dirname "$0")" && pwd)"
IMAGE_FILE="${SCRIPT_DIR}/sample-image/sample.jpeg"

if [[ ! -f "${IMAGE_FILE}" ]]; then
  echo "[ERROR] sample image not found: ${IMAGE_FILE}" >&2
  exit 1
fi

echo "Uploading ${IMAGE_FILE} -> presigned URL"
HTTP_CODE=$(
  curl -sS -X PUT \
    -H "Content-Type: image/jpeg" \
    --upload-file "${IMAGE_FILE}" \
    -o /dev/null -w "%{http_code}" \
    "${SIGNED_URL}"
)

  curl -sS -X PUT \
    -H "Content-Type: image/jpeg" \
    --upload-file "${IMAGE_FILE}" \
    "${SIGNED_URL}"


echo "HTTP ${HTTP_CODE}"
if [[ "${HTTP_CODE}" != "200" && "${HTTP_CODE}" != "201" ]]; then
  echo "Upload failed." >&2
  exit 1
fi
echo "Done."
