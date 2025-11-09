/**
 * シンプルなIoTエッジデバイス実装
 * - センサーデータをMQTT経由で送信
 * - 画像をIoT証明書でS3に直接アップロード
 */

import { mqtt, io, iot } from "aws-iot-device-sdk-v2";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fetch from "node-fetch";
import https from "https";
import fs from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import {
  CERT_PATH,
  PRIVATE_KEY_PATH,
  ROOTCA_CERT_PATH,
  CREDENTIALS_ENDPOINT,
  ROLE_ALIAS,
  UUID,
  ENDPOINT,
  REQUEST_TOPIC,
  DEFAULT_IMAGE_PATH,
  REGION,
  BUCKET_NAME,
} from "./config.js";

// 設定
const SENSOR_INTERVAL = 5000; // 5秒ごと
const CREDENTIALS_CACHE_TIME = 3300000; // 55分

// グローバル変数
let mqttConnection = null;
let cachedCredentials = null;
let credentialsExpiration = null;

// MQTT接続
async function connectMQTT() {
  const config =
    iot.AwsIotMqttConnectionConfigBuilder.new_mtls_builder_from_path(
      CERT_PATH,
      PRIVATE_KEY_PATH
    )
      .with_certificate_authority_from_path(undefined, ROOTCA_CERT_PATH)
      .with_client_id(`${UUID}_edge_device`)
      .with_endpoint(ENDPOINT)
      .build();

  const client = new mqtt.MqttClient(new io.ClientBootstrap());
  mqttConnection = client.new_connection(config);

  await mqttConnection.connect();
  console.log("✓ MQTT connected");
}

// IoT証明書から認証情報取得
async function getCredentials() {
  // キャッシュチェック
  if (cachedCredentials && Date.now() < credentialsExpiration) {
    return cachedCredentials;
  }

  // 新規取得
  const agent = new https.Agent({
    cert: fs.readFileSync(CERT_PATH),
    key: fs.readFileSync(PRIVATE_KEY_PATH),
    ca: fs.readFileSync(ROOTCA_CERT_PATH),
  });

  const response = await fetch(
    `https://${CREDENTIALS_ENDPOINT}/role-aliases/${ROLE_ALIAS}/credentials`,
    { agent }
  );

  const data = await response.json();
  cachedCredentials = data.credentials;
  credentialsExpiration = Date.now() + CREDENTIALS_CACHE_TIME;

  console.log("✓ Credentials updated");
  return cachedCredentials;
}

// センサーデータ取得（モック）
function readSensor() {
  return {
    temperature: (20 + Math.random() * 10).toFixed(1),
    humidity: (50 + Math.random() * 20).toFixed(1),
    co2: Math.floor(400 + Math.random() * 200),
  };
}

// 画像データ取得（モック）
function readImage(filePath) {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase().replace(".", "");
  return {
    buffer,
    ext,
    contentType: ext === "png" ? "image/png" : "image/jpeg",
  };
}

// S3アップロード
async function uploadToS3(credentials, imageBuffer, contentType, requestId) {
  const s3Client = new S3Client({
    region: REGION,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  //   const s3Key = `uploads/${timestamp}_${requestId}.${
  //     contentType.split("/")[1]
  //   }`;
  const image_id = randomUUID();
  const s3Key = `uploads/${UUID}/${image_id}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: imageBuffer,
      ContentType: contentType,
    })
  );

  console.log(`✓ S3: ${s3Key}`);
}

// メインループ
async function captureAndUpload(imageFilePath) {
  try {
    const requestId = `${UUID}_${Date.now()}`;

    // 1. センサーデータ取得
    const sensor = readSensor();
    console.log(`\n[${new Date().toISOString()}]`);
    console.log(
      `Sensor: ${sensor.temperature}°C, ${sensor.humidity}%, ${sensor.co2}ppm`
    );

    // 2. 画像取得
    const image = readImage(imageFilePath);
    console.log(`Image: ${image.buffer.length} bytes`);

    // 3. MQTTでテレメトリ送信
    await mqttConnection.publish(
      REQUEST_TOPIC,
      JSON.stringify({ requestId, ...sensor, timestamp: Date.now() }),
      mqtt.QoS.AtLeastOnce
    );
    console.log("✓ MQTT published");

    // 4. 認証情報取得
    const credentials = await getCredentials();

    // 5. S3アップロード
    await uploadToS3(credentials, image.buffer, image.contentType, requestId);
  } catch (error) {
    console.error("✗ Error:", error.message);
  }
}

// メイン
async function main() {
  const imageFilePath = process.argv[2] || DEFAULT_IMAGE_PATH;

  console.log("=== Simple IoT Edge Device ===");
  console.log(`Image: ${imageFilePath}`);
  console.log(`Interval: ${SENSOR_INTERVAL}ms\n`);

  // MQTT接続
  await connectMQTT();

  // 定期実行
  setInterval(() => captureAndUpload(imageFilePath), SENSOR_INTERVAL);

  // 終了処理
  process.on("SIGINT", async () => {
    console.log("\n\nShutting down...");
    await mqttConnection.disconnect();
    process.exit(0);
  });
}

main().catch(console.error);
