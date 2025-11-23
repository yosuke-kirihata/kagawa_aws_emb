import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const ddb = new DynamoDBClient({});

const BUCKET_NAME = process.env.IMAGE_BUCKET_NAME;
const TABLE_NAME = process.env.DDB_TABLE_NAME;

// MQTTメッセージを受信したらこの関数が起動します。
export const handler = async (event) => {
  // MQTTメッセージの内容を取得します。
  const body = typeof event === 'string' ? JSON.parse(event) : (event || {});
  const topic = body.topic || event?.topic;

  const temperature = body.temperature;
  const humidity = body.humidity;
  const co2 = body.co2;
  const m = String(topic || '').match(/^kagawa\/kosen\/denkilab\/rpi\/([^/]+)/);
  if (!m) {
    throw new Error('device_id not found in topic');
  }
  const device_id = m[1];
  const tsInput = body.timestamp;
  const tsNum = Number.isFinite(Number(tsInput)) ? Number(tsInput) : Date.now();
  const objectKey = body.s3Key;
  const image_id = objectKey.split('/').pop();

  if (!BUCKET_NAME) throw new Error('BUCKET_NAME env is required');

  if (!TABLE_NAME) throw new Error('TABLE_NAME or DDB_TABLE_NAME env is required');
  const item = {
    image_id: { S: image_id },
    device_id: { S: String(device_id) },
    timestamp: { N: String(tsNum) },
    status: { S: 'PENDING' },
    description: { S: '' },
  };

  // センサデータをDynamoDBに保存します。
  const isNum = (v) => v !== undefined && v !== null && !Number.isNaN(Number(v));
  if (isNum(temperature)) item.temperature = { N: String(Number(temperature)) };
  if (isNum(humidity)) item.humidity = { N: String(Number(humidity)) };
  if (isNum(co2)) item.co2 = { N: String(Number(co2)) };
  console.log('[ddb.putItem]', { table: TABLE_NAME, item });
  await ddb.send(new PutItemCommand({ TableName: TABLE_NAME, Item: item }));

  return { statusCode: 200, body: { message: 'success' } };
};
