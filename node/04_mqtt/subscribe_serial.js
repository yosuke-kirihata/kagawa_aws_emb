/**
 * AWS IoT CoreへMQTTで接続し、メッセージをSubscribeするサンプル
 * 
 * - IoT証明書を使ったmTLS認証でAWS IoT Coreに接続
 * - 指定トピックを購読し、受信したメッセージを表示
 * - メッセージのパースに成功したら、シリアルポート経由で"ALERT\n"を送信
 * - publish.jsと組み合わせて別ターミナルで実行することでPub/Subの動作を確認できる
 * 
 * 使い方:
 *   1. このファイルを実行してSubscribe状態にする（メッセージ待機）
 *   2. 別ターミナルでpublish.jsを実行してメッセージを送信
 *   3. このターミナルでメッセージ受信を確認
 *   4. パース成功時、接続されたシリアルデバイスにアラートを送信
 */
import { mqtt, io, iot } from "aws-iot-device-sdk-v2";
import { TextDecoder } from "util";
import { SerialPort } from "serialport";
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
let serialPort = null;

/**
 * シリアルポートを初期化
 */
function initializeSerialPort() {
  serialPort = new SerialPort({
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

  return serialPort;
}

/**
 * シリアルポート経由でアラートメッセージを送信
 */
function sendSerialAlert() {
  if (!serialPort || !serialPort.isOpen) {
    console.warn("[Serial] Port not available, skipping alert");
    return;
  }

  const alertMessage = "ALERT\n";
  serialPort.write(alertMessage, (err) => {
    if (err) {
      console.error("[Serial] Failed to send alert:", err.message);
    } else {
      console.log("[Serial] Alert sent:", alertMessage.trim());
    }
  });
}

async function main() {
  // シリアルポートを初期化
  initializeSerialPort();

  // AWS SDKの通信基盤を準備
  const clientBootstrap = new io.ClientBootstrap();

  // mTLS認証を使用したMQTT接続設定を構築
  // - IoT証明書と秘密鍵でデバイス認証
  // - ルートCA証明書でAWS IoTエンドポイントを検証
  // - Client IDに"_subscriber"を付けてpublish.jsと区別（同じIDだと接続が競合する）
  const config =
    iot.AwsIotMqttConnectionConfigBuilder.new_mtls_builder_from_path(
      CERT_PATH,
      PRIVATE_KEY_PATH
    )
      .with_certificate_authority_from_path(undefined, ROOTCA_CERT_PATH)
      .with_client_id(UUID + "_subscriber")
      .with_endpoint(ENDPOINT)
      .build();

  // MQTTクライアントと接続オブジェクトを生成
  const client = new mqtt.MqttClient(clientBootstrap);
  const connection = client.new_connection(config);

  // 接続イベント: AWS IoT Coreへの接続成功時
  connection.on("connect", () => {
    console.log("Connected to AWS IoT Core");
    console.log(`Subscribing to topic: ${topic}`);
  });

  // 切断イベント: ネットワーク切断時など
  connection.on("disconnect", () => {
    console.log("Disconnected from AWS IoT Core");
  });

  // エラーイベント: 接続エラーやプロトコルエラー時
  connection.on("error", (error) => {
    console.log("Connection error:", error);
  });

  // 中断イベント: 一時的なネットワーク障害時
  connection.on("interrupt", (error) => {
    console.log("Connection interrupted:", error);
  });

  // 再開イベント: 中断から復帰時
  connection.on("resume", () => {
    console.log("Connection resumed");
  });

  // AWS IoT Coreに接続（mTLS認証）
  await connection.connect();

  // メッセージ受信用のデコーダー（バイナリデータをUTF-8文字列に変換）
  const decoder = new TextDecoder("utf-8");
  
  // トピックを購読（QoS1: 最低1回配信保証）
  // コールバック関数で受信したメッセージを処理
  await connection.subscribe(
    topic,
    mqtt.QoS.AtLeastOnce,
    (topic, payload) => {
      // payloadはバイナリ形式なのでデコードして文字列化
      const message = decoder.decode(new Uint8Array(payload));
      console.log("\n--- Received Message ---");
      console.log("Topic:", topic);
      console.log("Payload:", message);
      
      // JSON形式ならパースして表示
      try {
        const data = JSON.parse(message);
        console.log("Parsed Data:", data);
        
        // パース成功時、シリアルポート経由でアラートを送信
        sendSerialAlert();
      } catch (e) {
        console.log("Could not parse as JSON");
      }
      console.log("------------------------\n");
    }
  );

  console.log("Waiting for messages... (Press Ctrl+C to exit)");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
