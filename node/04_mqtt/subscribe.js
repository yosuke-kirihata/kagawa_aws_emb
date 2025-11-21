/**
 * AWS IoT CoreへMQTTで接続し、メッセージをSubscribeするサンプル
 * 
 * - IoT証明書を使ったmTLS認証でAWS IoT Coreに接続
 * - 指定トピックを購読し、受信したメッセージを表示
 * - publish.jsと組み合わせて別ターミナルで実行することでPub/Subの動作を確認できる
 * 
 * 使い方:
 *   1. このファイルを実行してSubscribe状態にする（メッセージ待機）
 *   2. 別ターミナルでpublish.jsを実行してメッセージを送信
 *   3. このターミナルでメッセージ受信を確認
 */
import { mqtt, io, iot } from "aws-iot-device-sdk-v2";
import { TextDecoder } from "util";
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
  const clientBootstrap = new io.ClientBootstrap();

  const config =
    iot.AwsIotMqttConnectionConfigBuilder.new_mtls_builder_from_path(
      CERT_PATH,
      PRIVATE_KEY_PATH
    )
      .with_certificate_authority_from_path(undefined, ROOTCA_CERT_PATH)
      .with_client_id(UUID + "_subscriber")
      .with_endpoint(ENDPOINT)
      .build();

  const client = new mqtt.MqttClient(clientBootstrap);
  const connection = client.new_connection(config);

  connection.on("connect", () => {
    console.log("Connected to AWS IoT Core");
    console.log(`Subscribing to topic: ${topic}`);
  });

  connection.on("disconnect", () => {
    console.log("Disconnected from AWS IoT Core");
  });

  connection.on("error", (error) => {
    console.log("Connection error:", error);
  });

  connection.on("interrupt", (error) => {
    console.log("Connection interrupted:", error);
  });

  connection.on("resume", () => {
    console.log("Connection resumed");
  });

  await connection.connect();

  const decoder = new TextDecoder("utf-8");
  await connection.subscribe(
    topic,
    mqtt.QoS.AtLeastOnce,
    (topic, payload, dup, qos, retain) => {
      const message = decoder.decode(new Uint8Array(payload));
      console.log("\n--- Received Message ---");
      console.log("Topic:", topic);
      console.log("Payload:", message);
      try {
        const data = JSON.parse(message);
        console.log("Parsed Data:", data);
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
