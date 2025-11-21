/**
 * AWS IoT証明書で一時認証情報を取得し、S3にファイルをアップロードするサンプル
 *
 * 流れ:
 *   1. IoT証明書を使ったmTLS認証でAWS IoT Credentials Providerにアクセス
 *   2. Role Aliasを通じて一時的なAWS認証情報（AccessKey, SecretKey, SessionToken）を取得
 *   3. 取得した認証情報を使ってS3にファイルをアップロード
 *
 * 使い方:
 *   node upload-with-fetch.js <ファイルパス>
 *
 * 例:
 *   node upload-with-fetch.js ../aws-part/mqtt_connect/sample-image/sample.jpeg
 *
 * 前提条件:
 *   - config.jsにIoT証明書パス、Role Alias、S3バケット名が設定されていること
 *   - IoT証明書にS3アップロード権限が付与されたRoleが関連付けられていること
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
 * IoT証明書を使ってAWS一時認証情報を取得
 * 
 * AWS IoT Credentials ProviderはIoT証明書で認証されたデバイスに対して、
 * 一時的なAWS認証情報（STSトークン）を発行します。
 * これによりIoTデバイスがS3やDynamoDBなどのAWSサービスにアクセスできるようになります。
 * 
 * @returns {Object} AWS認証情報（accessKeyId, secretAccessKey, sessionTokenを含む）
 */
async function getCredentialsFromIoT() {
  console.log("=== Getting AWS Credentials from IoT Certificate ===");
  console.log("Endpoint:", CREDENTIALS_ENDPOINT);
  console.log("Role Alias:", ROLE_ALIAS);
  console.log("");

  // AWS IoT Credentials ProviderのURLを構築
  const url = `https://${CREDENTIALS_ENDPOINT}/role-aliases/${ROLE_ALIAS}/credentials`;
  console.log(`Requesting: ${url}`);

  const agent = new https.Agent({
    cert: fs.readFileSync(CERT_PATH), // IoT証明書（デバイスの身元証明）
    key: fs.readFileSync(PRIVATE_KEY_PATH), // 秘密鍵（証明書とペア）
    ca: fs.readFileSync(ROOTCA_CERT_PATH), // サーバー証明書の検証用CA
    rejectUnauthorized: true, // サーバー証明書を必ず検証
  });

  // mTLS認証でAWS IoT Credentials Providerにリクエスト
  const response = await fetch(url, {
    method: "GET",
    agent: agent,
  });

  console.log(`Status Code: ${response.status}`);
  console.log("");

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to get credentials");
    console.error("Response:", errorText);
    throw new Error(
      `Failed to get credentials: ${response.status} ${response.statusText}`
    );
  }

  // レスポンスから認証情報を取得
  const data = await response.json();
  console.log("Credentials obtained successfully");
  console.log(
    "  Access Key ID:",
    data.credentials.accessKeyId.substring(0, 20) + "..."
  );
  console.log("  Expiration:", data.credentials.expiration);
  console.log("");

  // 一時認証情報を返す（有効期限があるため、長時間使う場合は再取得が必要）
  return data.credentials;
}

/**
 * 一時認証情報を使ってS3にファイルをアップロード
 * 
 * @param {Object} credentials - AWS一時認証情報
 * @param {string} filePath - アップロードするファイルのパス
 * @returns {string} S3に保存されたファイルのKey
 */
async function uploadFileToS3(credentials, filePath) {
  // ファイル存在確認
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // ファイルを読み込み
  const fileContent = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  
  // S3キーを生成（タイムスタンプ付きで一意に）
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const s3Key = `uploads/${timestamp}_${fileName}`;

  console.log("S3 Key:", s3Key);
  console.log("File Size:", fileContent.length, "bytes");
  console.log("");

  // 一時認証情報を使ってS3クライアントを作成
  // accessKeyId, secretAccessKey, sessionTokenの3つを指定
  const s3Client = new S3Client({
    region: REGION,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  // S3アップロードコマンドを作成
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    Body: fileContent,
    ContentType: getContentType(fileName), // ファイルの種類を自動判定
  });

  // S3にアップロード実行
  console.log("Uploading to S3...");
  const response = await s3Client.send(command);
  console.log("Upload successful!");
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

  // 1. IoT証明書から一時認証情報を取得
  const credentials = await getCredentialsFromIoT();

  // 2. S3にファイルをアップロード
  const s3Key = await uploadFileToS3(credentials, filePath);

  console.log("All operations completed successfully!");
  console.log("Summary:");
  console.log("  Uploaded:", path.basename(filePath));
  console.log("  S3 Location:", `s3://${BUCKET_NAME}/${s3Key}`);
  console.log("");
}

main().catch((error) => {
  console.error("Error occurred:", error.message);
  if (error.stack) {
    console.error("");
    console.error("Stack trace:");
    console.error(error.stack);
  }
  console.error("");
  process.exit(1);
});
