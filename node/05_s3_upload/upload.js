import { mqtt, io, iot } from "aws-iot-device-sdk-v2";
import { TextDecoder } from "util";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import {
  CERT_PATH,
  PRIVATE_KEY_PATH,
  ROOTCA_CERT_PATH,
  UUID,
  ENDPOINT,
  REQUEST_TOPIC,
  RESPONSE_TOPIC,
  DEFAULT_IMAGE_PATH,
} from "./config.js";

const requestTopic = REQUEST_TOPIC;
const responseTopic = RESPONSE_TOPIC;

// アップロードする画像ファイルのパス（コマンドライン引数または環境変数から取得）
const imageFilePath = process.argv[2] || DEFAULT_IMAGE_PATH;

async function uploadImageToS3(presignedUrl, imageBuffer, contentType) {
  console.log("Uploading image to S3...");
  console.log("URL:", presignedUrl);
  console.log("Content-Type:", contentType);
  console.log("Image size:", imageBuffer.length, "bytes");

  const response = await fetch(presignedUrl, {
    method: "PUT",
    body: imageBuffer,
    headers: {
      "Content-Type": contentType,
    },
  });

  if (response.ok) {
    console.log("✓ Image uploaded successfully!");
    return true;
  } else {
    console.error("✗ Upload failed:", response.status, response.statusText);
    const text = await response.text();
    console.error("Response:", text);
    return false;
  }
}

async function main() {
  // 画像ファイルの存在確認
  if (!fs.existsSync(imageFilePath)) {
    console.error(`Error: Image file not found: ${imageFilePath}`);
    console.log("Usage: node upload.js <image-file-path>");
    process.exit(1);
  }

  // 画像ファイルを読み込み
  const imageBuffer = fs.readFileSync(imageFilePath);
  const ext = path.extname(imageFilePath).toLowerCase().replace(".", "");
  const contentType = ext === "png" ? "image/png" : "image/jpeg";

  console.log(`Reading image: ${imageFilePath}`);
  console.log(`File size: ${imageBuffer.length} bytes`);
  console.log(`Content-Type: ${contentType}`);

  // MQTT接続の設定
  const clientBootstrap = new io.ClientBootstrap();
  const config =
    iot.AwsIotMqttConnectionConfigBuilder.new_mtls_builder_from_path(
      CERT_PATH,
      PRIVATE_KEY_PATH
    )
      .with_certificate_authority_from_path(undefined, ROOTCA_CERT_PATH)
      .with_clean_session(false)
      .with_client_id(UUID + "_uploader")
      .with_endpoint(ENDPOINT)
      .build();

  const client = new mqtt.MqttClient(clientBootstrap);
  const connection = client.new_connection(config);

  connection.on("connect", () => {
    console.log("Connected to AWS IoT Core");
  });

  connection.on("disconnect", () => {
    console.log("Disconnected from AWS IoT Core");
  });

  connection.on("error", (error) => {
    console.error("Connection error:", error);
  });

  await connection.connect();

  // レスポンストピックを購読
  const decoder = new TextDecoder("utf-8");
  let uploadCompleted = false;

  await connection.subscribe(
    responseTopic,
    mqtt.QoS.AtLeastOnce,
    async (topic, payload, dup, qos, retain) => {
      if (uploadCompleted) return; // 重複実行を防ぐ

      const message = decoder.decode(new Uint8Array(payload));
      console.log("\n--- Received Upload URL ---");
      console.log("Topic:", topic);
      console.log("Payload:", message);

      try {
        const data = JSON.parse(message);
        console.log("Parsed Data:", data);

        if (data.uploadUrl) {
          // 署名付きURLを使って画像をアップロード
          const success = await uploadImageToS3(
            data.uploadUrl,
            imageBuffer,
            data.contentType || contentType
          );

          if (success) {
            console.log("\n=== Upload Process Completed ===");
            console.log("Bucket:", data.bucket);
            console.log("Key:", data.key);
            uploadCompleted = true;

            // 接続を切断して終了
            setTimeout(async () => {
              await connection.disconnect();
              process.exit(0);
            }, 1000);
          }
        }
      } catch (e) {
        console.error("Error processing response:", e);
      }
    }
  );

  console.log(`Subscribed to topic: ${responseTopic}`);

  // Lambda に署名付きURL生成をリクエスト
  const requestMessage = JSON.stringify({
    topic: requestTopic,
    ext: ext,
    contentType: contentType,
    temperature: 25.5,
    humidity: 60.2,
    co2: 450,
    timestamp: Date.now(),
  });

  console.log("\n--- Requesting Upload URL ---");
  console.log("Topic:", requestTopic);
  console.log("Message:", requestMessage);

  await connection.publish(requestTopic, requestMessage, mqtt.QoS.AtLeastOnce);
  console.log("Request sent. Waiting for response...");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
