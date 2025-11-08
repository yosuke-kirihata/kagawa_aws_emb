#!/usr/bin/env bash
set -euo pipefail

# Defaults
IOT_ENDPOINT=$(aws iot describe-endpoint --endpoint-type iot:Data-ATS --query endpointAddress --output text --region ap-northeast-1)
IOT_TOPIC="Your default topic"
IOT_CERT_FILE="Your certificate file"
IOT_KEY_FILE="Your private key"
IOT_CA_FILE="Your CA file"
TEMP_VALUE=24.0
HUMIDITY_VALUE=40.0
CO2_VALUE=1000

print_usage() {
  echo "Usage: ./pub.sh [-t temp] [-h humidity] [-c co2] [-T topic]" >&2
}

while getopts "t:h:c:T:h" opt; do
  case $opt in
    t) TEMP_VALUE=$OPTARG ;;
    h) HUMIDITY_VALUE=$OPTARG ;;
    c) CO2_VALUE=$OPTARG ;;
    T) IOT_TOPIC=$OPTARG ;;
    h) print_usage; exit 0 ;;
    *) print_usage; exit 1 ;;
  esac
done

if [[ -z "${IOT_ENDPOINT}" ]]; then
  echo "[ERROR] IOT_ENDPOINT is required (e.g. aaaaa-ats.iot.ap-northeast-1.amazonaws.com)" >&2
  exit 1
fi

if ! command -v mosquitto_pub >/dev/null 2>&1; then
  echo "[ERROR] mosquitto_pub not found. Install mosquitto-clients." >&2
  exit 1
fi

if [[ ! -f "$IOT_CERT_FILE" || ! -f "$IOT_KEY_FILE" || ! -f "$IOT_CA_FILE" ]]; then
  echo "[ERROR] cert/key/ca file not found. Check IOT_CERT_FILE/IOT_KEY_FILE/IOT_CA_FILE." >&2
  exit 1
fi

if command -v gdate >/dev/null; then
    TS_MS=$(gdate +%s%3N)
else
    TS_MS=$(($(date +%s)*1000))
fi

PAYLOAD=$(cat << JSON
{"temperature": ${TEMP_VALUE}, "humidity": ${HUMIDITY_VALUE}, "co2": ${CO2_VALUE}, "timestamp": ${TS_MS}}
JSON
)

echo "Topic    : ${IOT_TOPIC}"
echo "Payload  : ${PAYLOAD}"

mosquitto_pub \
  -h "${IOT_ENDPOINT}" -p 8883 \
  --cafile "${IOT_CA_FILE}" \
  --cert   "${IOT_CERT_FILE}" \
  --key    "${IOT_KEY_FILE}" \
  -q 0 -t "${IOT_TOPIC}" -m "${PAYLOAD}"

echo "Published." 
