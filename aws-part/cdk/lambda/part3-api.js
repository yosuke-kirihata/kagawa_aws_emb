import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ddb = new DynamoDBClient({});
const s3 = new S3Client({});

const TABLE_NAME = process.env.TABLE_NAME;
const GSI_NAME = process.env.GSI_NAME;
const PK_NAME = process.env.PK_NAME || 'device_id';
const IMAGE_BUCKET_NAME = process.env.IMAGE_BUCKET_NAME || '';

export const handler = async (event) => {
  const qs = event?.queryStringParameters || {};
  const pathParams = event?.pathParameters || {};
  const deviceId = pathParams.device_id;
  const imageId = pathParams.image_id;
  const limit = Math.min(Number(qs.limit || 50), 200);
  if (!TABLE_NAME || !GSI_NAME) return resp(500, { message: 'TABLE_NAME/GSI_NAME not set' });
  if (!deviceId) return resp(400, { message: 'path parameter device_id is required' });

  if (imageId) {
    if (!IMAGE_BUCKET_NAME) return resp(500, { message: 'IMAGE_BUCKET_NAME not set' });
    const key = `uploads/${deviceId}/${imageId}`;
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: IMAGE_BUCKET_NAME, Key: key }), { expiresIn: 900 });
    return resp(200, { url });
  }

  const cmd = new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: GSI_NAME,
    KeyConditionExpression: `#pk = :pk`,
    ExpressionAttributeNames: { '#pk': PK_NAME },
    ExpressionAttributeValues: { ':pk': { S: deviceId } },
    ScanIndexForward: false,
    Limit: limit,
  });
  const out = await ddb.send(cmd);
  const items = (out.Items || []).map(unmarshallLite);
  const itemsWithUrl = await Promise.all(items.map(async (it) => {
    if (IMAGE_BUCKET_NAME && it.device_id && it.image_id) {
      const key = `uploads/${it.device_id}/${it.image_id}`;
      try {
        const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: IMAGE_BUCKET_NAME, Key: key }), { expiresIn: 900 });
        return { ...it, image_url: url };
      } catch {
        return it;
      }
    }
    return it;
  }));
  return resp(200, { items: itemsWithUrl });
};

function unmarshallLite(item) {
  const obj = {};
  for (const [k, v] of Object.entries(item || {})) {
    if ('S' in v) obj[k] = v.S;
    else if ('N' in v) obj[k] = Number(v.N);
    else if ('BOOL' in v) obj[k] = !!v.BOOL;
    else obj[k] = v;
  }
  return obj;
}

function resp(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}
