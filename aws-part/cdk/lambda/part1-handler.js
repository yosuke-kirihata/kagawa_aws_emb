import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { IoTDataPlaneClient, PublishCommand } from '@aws-sdk/client-iot-data-plane';
import { IoTClient, DescribeEndpointCommand } from '@aws-sdk/client-iot';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'node:crypto';

const s3 = new S3Client({});
const ddb = new DynamoDBClient({});

// IoTデータプレーンのエンドポイントは毎回DescribeEndpointで取得（コールドスタート時に一度だけ）
let cachedIotData;
async function getIotDataClient() {
  if (cachedIotData) return cachedIotData;
  const iot = new IoTClient({});
  const out = await iot.send(new DescribeEndpointCommand({ endpointType: 'iot:Data-ATS' }));
  const endpoint = out.endpointAddress; // 例: aaaaa-ats.iot.ap-northeast-1.amazonaws.com
  cachedIotData = new IoTDataPlaneClient({ endpoint: `https://${endpoint}` });
  return cachedIotData;
}

// 環境変数
const BUCKET_NAME = process.env.IMAGE_BUCKET_NAME; // 既存の画像バケット名
const TABLE_NAME = process.env.DDB_TABLE_NAME; // 既存DDB

// 定数
const DEFAULT_EXPIRES = 300; // 秒

export const handler = async (event) => {
  const body = typeof event === 'string' ? JSON.parse(event) : (event || {});
  const topic = body.topic || event?.topic;
  const ext = (body.ext || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const contentType = body.contentType || (ext === 'png' ? 'image/png' : 'image/jpeg');
  const expiresIn = Number(body.expiresIn || DEFAULT_EXPIRES);

  const temperature = body.temperature;
  const humidity = body.humidity;
  const co2 = body.co2;
  const m = String(topic || '').match(/^kagawa\/kosen\/denkilab\/rpi\/([^/]+)/);
  if (!m) {
    throw new Error('device_id not found in topic');
  }
  const device_id = m[1];
  // timestampは数値（エポックms）として扱う
  const tsInput = body.timestamp;
  const tsNum = Number.isFinite(Number(tsInput)) ? Number(tsInput) : Date.now();
  const image_id = randomUUID();


  if (!BUCKET_NAME) throw new Error('BUCKET_NAME env is required');

  const objectKey = `uploads/${device_id}/${image_id}`;

  const presignedUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET_NAME, Key: objectKey, ContentType: contentType }),
    { expiresIn }
  );

  const replyTopic = `image-upload-url/resp/${device_id}`;
  const payload = JSON.stringify({
    bucket: BUCKET_NAME,
    key: objectKey,
    uploadUrl: presignedUrl,
    expiresIn,
    contentType,
  });

  // Debug logs (body, env, publish payload)
  console.log('[incoming event]', { topic, body });
  console.log('[env]', { BUCKET_NAME, TABLE_NAME });
  console.log('[mqtt.publish]', { replyTopic, payload });

  const iotData = await getIotDataClient();
  await iotData.send(
    new PublishCommand({ topic: replyTopic, qos: 0, payload: new TextEncoder().encode(payload) })
  );

  // DynamoDBにPENDINGレコードを保存
  if (!TABLE_NAME) throw new Error('TABLE_NAME or DDB_TABLE_NAME env is required');
  const item = {
    image_id: { S: image_id },
    device_id: { S: String(device_id) },
    timestamp: { N: String(tsNum) },
    status: { S: 'PENDING' },
    description: { S: '' },
  };
  const isNum = (v) => v !== undefined && v !== null && !Number.isNaN(Number(v));
  if (isNum(temperature)) item.temperature = { N: String(Number(temperature)) };
  if (isNum(humidity)) item.humidity = { N: String(Number(humidity)) };
  if (isNum(co2)) item.co2 = { N: String(Number(co2)) };
  console.log('[ddb.putItem]', { table: TABLE_NAME, item });
  await ddb.send(new PutItemCommand({ TableName: TABLE_NAME, Item: item }));

  return { statusCode: 200, body: payload };
};
