/**
 * node-fetchを使ってS3にファイルをアップロードする
 *
 *
 * 使い方:
 *   node upload-with-fetch.js <ファイルパス>
 *
 * 例:
 *   node upload-with-fetch.js ..\aws-part\mqtt_connect\sample-image\sample.jpeg
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fetch from "node-fetch";
import https from "https";
import fs from "fs";
import path from "path";
import {
  CERT_PATH,
  PRIVATE_KEY_PATH,
  ROOTCA_CERT_PATH,
  CREDENTIALS_ENDPOINT,
  ROLE_ALIAS,
  REGION,
  BUCKET_NAME,
} from "./config.js";

/**
 * IoT証明書を使ってAWS一時認証情報を取得 (node-fetch版)
 */
async function getCredentialsFromIoT() {
  console.log("=== Getting AWS Credentials from IoT Certificate ===");
  console.log("Endpoint:", CREDENTIALS_ENDPOINT);
  console.log("Role Alias:", ROLE_ALIAS);
  console.log("");

  const url = `https://${CREDENTIALS_ENDPOINT}/role-aliases/${ROLE_ALIAS}/credentials`;
  console.log(`Requesting: ${url}`);

  // node-fetchでmTLS (mutual TLS)を使うためのagent設定
  const agent = new https.Agent({
    cert: fs.readFileSync(CERT_PATH),
    key: fs.readFileSync(PRIVATE_KEY_PATH),
    ca: fs.readFileSync(ROOTCA_CERT_PATH),
    rejectUnauthorized: true,
  });

  const response = await fetch(url, {
    method: "GET",
    agent: agent,
  });

  console.log(`Status Code: ${response.status}`);
  console.log("");

  if (!response.ok) {
    const errorText = await response.text();
    console.error("✗ Failed to get credentials");
    console.error("Response:", errorText);
    throw new Error(
      `Failed to get credentials: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  console.log("✓ Credentials obtained successfully");
  console.log(
    "  Access Key ID:",
    data.credentials.accessKeyId.substring(0, 20) + "..."
  );
  console.log("  Expiration:", data.credentials.expiration);
  console.log("");

  return data.credentials;
}

/**
 * S3にファイルをアップロード
 */
async function uploadFileToS3(credentials, filePath) {
  console.log("=== Uploading File to S3 ===");
  console.log("File:", filePath);
  console.log("Bucket:", BUCKET_NAME);
  console.log("");

  // ファイル存在確認
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // ファイルを読み込み
  const fileContent = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const s3Key = `uploads/${timestamp}_${fileName}`;

  console.log("S3 Key:", s3Key);
  console.log("File Size:", fileContent.length, "bytes");
  console.log("");

  // S3クライアント作成
  const s3Client = new S3Client({
    region: REGION,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  // アップロード実行
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    Body: fileContent,
    ContentType: getContentType(fileName),
  });

  console.log("Uploading to S3...");
  const response = await s3Client.send(command);
  console.log("✓ Upload successful!");
  console.log("  ETag:", response.ETag);
  console.log(
    "  URL:",
    `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${s3Key}`
  );
  console.log("");

  return s3Key;
}

/**
 * ファイル拡張子からContent-Typeを推測
 */
function getContentType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const contentTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".txt": "text/plain",
    ".json": "application/json",
    ".pdf": "application/pdf",
  };
  return contentTypes[ext] || "application/octet-stream";
}

/**
 * メイン処理
 */
async function main() {
  try {
    // コマンドライン引数からファイルパスを取得
    const filePath = process.argv[2];

    if (!filePath) {
      console.error("エラー: ファイルパスを指定してください");
      console.error("");
      console.error("使い方:");
      console.error("  node upload-with-fetch.js <ファイルパス>");
      console.error("");
      console.error("例:");
      console.error(
        "  node upload-with-fetch.js ..\\aws-part\\mqtt_connect\\sample-image\\sample.jpeg"
      );
      process.exit(1);
    }

    console.log("=================================================");
    console.log("  node-fetch を使用したS3アップロード");
    console.log("=================================================");
    console.log("");

    // 1. IoT証明書から一時認証情報を取得
    const credentials = await getCredentialsFromIoT();

    // 2. S3にファイルをアップロード
    const s3Key = await uploadFileToS3(credentials, filePath);

    console.log("=================================================");
    console.log("  ✓ All operations completed successfully!");
    console.log("=================================================");
    console.log("");
    console.log("Summary:");
    console.log("  Uploaded:", path.basename(filePath));
    console.log("  S3 Location:", `s3://${BUCKET_NAME}/${s3Key}`);
    console.log("");
    process.exit(0);
  } catch (error) {
    console.error("");
    console.error("=================================================");
    console.error("  ✗ Error occurred");
    console.error("=================================================");
    console.error("");
    console.error("Error:", error.message);
    if (error.stack) {
      console.error("");
      console.error("Stack trace:");
      console.error(error.stack);
    }
    console.error("");
    process.exit(1);
  }
}

main();
