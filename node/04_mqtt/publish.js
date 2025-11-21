/**
 * AWS IoT CoreへMQTTで接続し、メッセージをPublishするサンプル
 * 
 * - IoT証明書を使ったmTLS認証でAWS IoT Coreに接続
 * - 指定トピックに対してセンサーデータ（温度、湿度、CO2）をJSON形式でPublish
 * - subscribe.jsと組み合わせて別ターミナルで実行することでPub/Subの動作を確認できる
 */
import { mqtt, io, iot } from "aws-iot-device-sdk-v2";
import {
  CERT_PATH,
  PRIVATE_KEY_PATH,
  ROOTCA_CERT_PATH,
  UUID,
  ENDPOINT,
  REQUEST_TOPIC,
} from "./config.js";

const topic = REQUEST_TOPIC;

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

  // 接続イベント: AWS IoT Coreへの接続成功時
  connection.on("connect", () => {
    console.log("connect");
  });

  // 切断イベント: ネットワーク切断時など
  connection.on("disconnect", () => {
    console.log("disconnect");
  });

  // エラーイベント: 接続エラーやプロトコルエラー時
  connection.on("error", (error) => {
    console.log("error", error);
  });

  // AWS IoT Coreに接続（mTLS認証）
  await connection.connect();

  // センサーデータをJSON形式で作成
  // 温度(℃)、湿度(%)、CO2濃度(ppm)、タイムスタンプを含む
  const message = JSON.stringify({
    temperature: 25,
    humidity: 60,
    co2: 400,
    timestamp: Date.now(),
  });
  
  // トピックにメッセージをPublish（QoS1: 最低1回配信保証）
  console.log(`Publishing to topic: ${topic}`);
  console.log(`Message: ${message}`);
  await connection.publish(topic, message, mqtt.QoS.AtLeastOnce);
  console.log("Message published successfully!");
  
  // 処理完了後、接続を切断
  await connection.disconnect();
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
