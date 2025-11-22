/**
 * シンプルなIoTエッジデバイス実装サンプル
 * - センサーデータをMQTT経由で送信
 * - 画像をIoT証明書でS3に直接アップロード
 * 使い方:
 *   node edge-device-simple.js
 */

import { mqtt, io, iot } from "aws-iot-device-sdk-v2";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fetch from "node-fetch";
import https from "https";
import fs from "fs";
import { createRequire } from "module";
import { SerialPort, ReadlineParser } from "serialport";
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

const require = createRequire(import.meta.url);
const GStreamer = require("gstreamer-superficial");

// 設定
const UPLOAD_INTERVAL_MS = 20_000; // アップロード間隔(20秒)
const CREDENTIALS_CACHE_TIME = 3_300_000; // 55分
const SERIAL_PORT_PATH = "/dev/ttyACM0";
const SERIAL_BAUD_RATE = 115200;
const SERIAL_TIMEOUT_MS = 10_000; // タイムアウト10秒
const CAMERA_WARMUP_MS = 3_000; // カメラウォームアップ時間

// グローバル変数
let mqttConnection = null;
let cachedCredentials = null;
let credentialsExpiration = null;
let latestSensorData = null; // 最新のセンサーデータを保持

// シリアルポート初期化（イベント駆動でセンサーデータを更新）
// 初回データ受信を待つが、タイムアウト時はデフォルト値で続行
function initializeSerial() {
  return new Promise((resolve, reject) => {
    const port = new SerialPort({
      path: SERIAL_PORT_PATH,
      baudRate: SERIAL_BAUD_RATE,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
    });

    const parser = new ReadlineParser({ delimiter: "\r\n" });
    port.pipe(parser);

    let firstDataReceived = false;

    // タイムアウト設定: 10秒待ってデータが来なければデフォルト値で続行
    const timeout = setTimeout(() => {
      if (!firstDataReceived) {
        console.log(`Serial timeout (${SERIAL_TIMEOUT_MS}ms). Using init sensor values.`);
        // 異常値（センサー未接続）
        latestSensorData = {
          co2: -100,
          temperature: -100,
          humidity: -100,
        };
        resolve();
      }
    }, SERIAL_TIMEOUT_MS);

    parser.on("data", (line) => {
      const match = String(line).trim().match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
      if (match) {
        latestSensorData = {
          co2: Number(match[1]),
          temperature: Number(match[2]),
          humidity: Number(match[3]),
        };
        
        // 初回データ受信時にPromiseを解決
        if (!firstDataReceived) {
          firstDataReceived = true;
          clearTimeout(timeout); // タイムアウトをキャンセル
          console.log("First sensor data received:", latestSensorData);
          resolve();
        }
      }
    });

    port.on("open", () => console.log("Serial port opened"));
    port.on("error", (err) => {
      console.error("Serial error:", err.message);
      if (!firstDataReceived) {
        clearTimeout(timeout);
        // エラーでもプログラムを続行（デフォルト値を使用）
        latestSensorData = {
          co2: -100,
          temperature: -100,
          humidity: -100,
        };
        console.log("Continuing with default sensor values due to error.");
        resolve();
      }
    });
  });
}

// MQTT接続
async function initializeMqttConnection() {
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
  console.log("MQTT connected");
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

  console.log("Credentials updated");
  return cachedCredentials;
}

function getLatestSensorData() {
  return latestSensorData;
}

// 画像データ取得（GStreamerで非同期キャプチャ）
async function readImage() {
  const tempPath = `./capture_${randomUUID()}.jpg`;
  const pipelineStr = `libcamerasrc af-mode=2 ! video/x-raw,width=1920,height=1080,framerate=30/1 ! videorate ! identity drop-allocation=true ! jpegenc ! multifilesink location=${tempPath} max-files=1`;
  
  await new Promise((resolve, reject) => {
    const pipeline = new GStreamer.Pipeline(pipelineStr.trim());
    pipeline.play();
    
    setTimeout(() => {
      pipeline.stop();
      resolve();
    }, CAMERA_WARMUP_MS);
    
  });
  
  const buffer = fs.readFileSync(tempPath);
  fs.unlinkSync(tempPath); // 一時ファイル削除
  
  return {
    buffer,
    contentType: "image/jpeg",
  };
}

// S3アップロード
async function uploadToS3(credentials, imageBuffer, contentType, s3Key) {
  const s3Client = new S3Client({
    region: REGION,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: imageBuffer,
      ContentType: contentType,
    })
  );

  console.log(`S3: ${s3Key}`);
}

// メインループ
async function captureAndUpload() {
  try {
    // 1. センサーデータ取得
    const sensor = getLatestSensorData();
    console.log(`\n[${new Date().toISOString()}]`);
    console.log(
      `Sensor: ${sensor.temperature}°C, ${sensor.humidity}%, ${sensor.co2}ppm`
    );

    // 2. 画像取得
    const image = await readImage();
    console.log(`Image: ${image.buffer.length} bytes`);

    // 3. S3キー生成
    const s3Key = `uploads/${UUID}/${randomUUID()}.jpg`;

    // 4. MQTT送信（先に実行）
    await mqttConnection.publish(
      REQUEST_TOPIC,
      JSON.stringify({ s3Key, ...sensor, timestamp: Date.now() }),
      mqtt.QoS.AtLeastOnce
    );
    console.log("MQTT published");

    // 5. 認証情報取得
    const credentials = await getCredentials();

    // 6. S3アップロード（MQTT送信後）
    await uploadToS3(credentials, image.buffer, image.contentType, s3Key);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

/**
 * メイン処理
 */
async function main() {
  console.log("=== Simple IoT Edge Device ===");

  // シリアルポート初期化（初回データ受信まで待機）
  console.log("Waiting for first sensor data...");
  await initializeSerial();

  // MQTT接続
  console.log("Initializing MQTT connection...");
  await initializeMqttConnection();

  // 終了処理の登録
  process.on("SIGINT", async () => {
    console.log("\n\nShutting down...");
    await mqttConnection.disconnect();
    process.exit(0);
  });

  // 定期実行開始
  console.log(`\nStarting periodic execution every ${UPLOAD_INTERVAL_MS}ms\n`);
  
  // 無限ループで定期実行（センサーはイベント駆動で常に最新値を保持）
  while (true) {
    const startTime = Date.now();
    
    await captureAndUpload();
    
    // 処理時間を考慮して残り時間だけ待機
    const elapsedTime = Date.now() - startTime;
    const remainingTime = UPLOAD_INTERVAL_MS - elapsedTime;
    
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }
  }
}

main().catch(console.error);
