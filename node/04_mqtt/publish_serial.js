/**
 * AWS IoT CoreへMQTTで接続し、メッセージをPublishするサンプル
 * 
 * - IoT証明書を使ったmTLS認証でAWS IoT Coreに接続
 * - シリアルポートからセンサーデータ（CO2、温度、湿度）を受信
 * - 受信したデータをJSON形式に変換してAWS IoT CoreへPublish
 * - subscribe.jsと組み合わせて別ターミナルで実行することでPub/Subの動作を確認できる
 */
import { mqtt, io, iot } from "aws-iot-device-sdk-v2";
import { SerialPort, ReadlineParser } from "serialport";
import {
  CERT_PATH,
  PRIVATE_KEY_PATH,
  ROOTCA_CERT_PATH,
  UUID,
  ENDPOINT,
  REQUEST_TOPIC,
} from "./config.js";

// シリアルポート設定
const SERIAL_PORT_PATH = "/dev/ttyACM0";
const SERIAL_BAUD_RATE = 115200;

const topic = REQUEST_TOPIC;
let mqttConnection = null;

/**
 * シリアルデータをパースしてセンサー値を抽出
 * フォーマット: "CO2,温度,湿度" (例: "450,24.5,55.3")
 */
function parseSerialData(line) {
  const match = line.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if (!match) {
    return null;
  }

  const [_, co2Raw, tempRaw, humidityRaw] = match;
  return {
    co2: Number(co2Raw),
    temperature: Number(tempRaw),
    humidity: Number(humidityRaw),
    timestamp: Date.now(),
  };
}

/**
 * シリアルポートを初期化してデータ受信を開始
 */
function initializeSerialPort() {
  const serialPort = new SerialPort({
    path: SERIAL_PORT_PATH,
    baudRate: SERIAL_BAUD_RATE,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
  });

  serialPort.on("open", () => {
    console.log(`[Serial] Port opened: ${SERIAL_PORT_PATH} @ ${SERIAL_BAUD_RATE}bps`);
  });

  serialPort.on("error", (err) => {
    console.error("[Serial] Error:", err.message);
  });

  const parser = new ReadlineParser({ delimiter: "\r\n" });
  serialPort.pipe(parser);

  parser.on("data", async (data) => {
    const line = String(data).trim();
    console.log(`[Serial] Raw data: ${line}`);

    const sensorData = parseSerialData(line);
    if (!sensorData) {
      console.log("[Serial] Invalid format, skipping...");
      return;
    }

    console.log(`[Serial] Parsed: CO2=${sensorData.co2}ppm, Temp=${sensorData.temperature}°C, Humidity=${sensorData.humidity}%`);

    // MQTTで送信
    if (mqttConnection) {
      await publishSensorData(sensorData);
    } else {
      console.warn("[MQTT] Connection not ready, skipping publish");
    }
  });

  parser.on("error", (err) => {
    console.error("[Serial] Parser error:", err);
  });

  return serialPort;
}

/**
 * センサーデータをMQTTでPublish
 */
async function publishSensorData(sensorData) {
  const message = JSON.stringify(sensorData);
  
  try {
    console.log(`[MQTT] Publishing to topic: ${topic}`);
    console.log(`[MQTT] Message: ${message}`);
    await mqttConnection.publish(topic, message, mqtt.QoS.AtLeastOnce);
    console.log("[MQTT] Message published successfully!");
  } catch (error) {
    console.error("[MQTT] Publish error:", error);
  }
}

async function main() {
  // AWS SDKの通信基盤を準備
  const clientBootstrap = new io.ClientBootstrap();

  // mTLS認証を使用したMQTT接続設定を構築
  // - IoT証明書と秘密鍵でデバイス認証
  // - ルートCA証明書でAWS IoTエンドポイントを検証
  const config =
    iot.AwsIotMqttConnectionConfigBuilder.new_mtls_builder_from_path(
      CERT_PATH,
      PRIVATE_KEY_PATH
    )
      .with_certificate_authority_from_path(undefined, ROOTCA_CERT_PATH)
      .with_client_id(UUID)
      .with_endpoint(ENDPOINT)
      .build();

  // MQTTクライアントと接続オブジェクトを生成
  const client = new mqtt.MqttClient(clientBootstrap);
  const connection = client.new_connection(config);
  mqttConnection = connection;

  // 接続イベント: AWS IoT Coreへの接続成功時
  connection.on("connect", () => {
    console.log("[MQTT] Connected to AWS IoT Core");
  });

  // 切断イベント: ネットワーク切断時など
  connection.on("disconnect", () => {
    console.log("[MQTT] Disconnected from AWS IoT Core");
  });

  // エラーイベント: 接続エラーやプロトコルエラー時
  connection.on("error", (error) => {
    console.error("[MQTT] Error:", error);
  });

  // AWS IoT Coreに接続（mTLS認証）
  await connection.connect();

  // シリアルポートを初期化してデータ受信を開始
  console.log("\n=== Starting Serial Port Monitoring ===");
  console.log("Waiting for sensor data... (Press Ctrl+C to exit)\n");
  initializeSerialPort();

  // シャットダウンハンドラー
  process.on("SIGINT", async () => {
    console.log("\n\n[System] Shutting down...");
    if (mqttConnection) {
      await mqttConnection.disconnect();
    }
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
