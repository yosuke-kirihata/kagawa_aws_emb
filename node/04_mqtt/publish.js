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
      .with_clean_session(false)
      .with_client_id(UUID)
      .with_endpoint(ENDPOINT)
      .build();

  const client = new mqtt.MqttClient(clientBootstrap);
  const connection = client.new_connection(config);

  connection.on("connect", () => {
    console.log("connect");
  });

  connection.on("disconnect", () => {
    console.log("disconnect");
  });

  connection.on("error", (error) => {
    console.log("error", error);
  });

  await connection.connect();

  const decoder = new TextDecoder("utf-8");
  await connection.subscribe(
    topic,
    mqtt.QoS.AtLeastOnce,
    (topic, payload, dup, qos, retain) => {
      const message = decoder.decode(new Uint8Array(payload));
      console.log("message", topic, message);
    }
  );

  // const message = JSON.stringify({ data: 1 });
  const message = JSON.stringify({
    temperature: 25,
    humidity: 60,
    co2: 400,
    timestamp: Date.now(),
  });
  await connection.publish(topic, message, mqtt.QoS.AtLeastOnce);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
