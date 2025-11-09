// AWS IoT 接続設定
export const BASE_CERT_PATH = "../crt/";
export const PRIVATE_KEY_PATH = `${BASE_CERT_PATH}boo-private.pem.key`;
export const CERT_PATH = `${BASE_CERT_PATH}bar-certificate.pem.crt`;
export const ROOTCA_CERT_PATH = `${BASE_CERT_PATH}AmazonRootCA1.pem`;

// デバイス設定
export const UUID = "01";
export const ENDPOINT = "hoge.iot.ap-northeast-1.amazonaws.com";
export const CREDENTIALS_ENDPOINT =
  "fuga.credentials.iot.ap-northeast-1.amazonaws.com";

// AWS IoT Credentials Provider設定
export const ROLE_ALIAS = "2025-kagawa-iot-s3-upload-alias";
export const THING_NAME = "kagawa_iot_live";

// S3設定
export const REGION = "ap-northeast-1";
export const BUCKET_NAME = "kagawa-test-image-01";

// MQTT トピック
export const REQUEST_TOPIC = `kagawa/kosen/denkilab/rpi/${UUID}`;
export const RESPONSE_TOPIC = `image-upload-url/resp/${UUID}`;

// 画像設定
export const DEFAULT_IMAGE_PATH =
  "../aws-part/mqtt_connect/sample-image/sample.jpeg";
