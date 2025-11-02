import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';

const ddb = new DynamoDBClient({});

const TABLE_NAME = process.env.TABLE_NAME;
const GSI_NAME = process.env.GSI_NAME; // device_id (PK), timestamp (SK)
const PK_NAME = process.env.PK_NAME || 'device_id';

export const handler = async (event) => {
  const qs = event?.queryStringParameters || {};
  const pathParams = event?.pathParameters || {};
  const deviceId = pathParams.device_id;
  const limit = Math.min(Number(qs.limit || 50), 200);
  if (!TABLE_NAME || !GSI_NAME) return resp(500, { message: 'TABLE_NAME/GSI_NAME not set' });
  if (!deviceId) return resp(400, { message: 'path parameter device_id is required' });

  const cmd = new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: GSI_NAME,
    KeyConditionExpression: `#pk = :pk`,
    ExpressionAttributeNames: { '#pk': PK_NAME },
    ExpressionAttributeValues: { ':pk': { S: deviceId } },
    ScanIndexForward: false, // timestamp降順
    Limit: limit,
  });
  const out = await ddb.send(cmd);
  const items = (out.Items || []).map(unmarshallLite);
  return resp(200, { items });
};

function unmarshallLite(item) {
  const obj = {};
  for (const [k, v] of Object.entries(item || {})) {
    if ('S' in v) obj[k] = v.S;
    else if ('N' in v) obj[k] = Number(v.N);
    else if ('BOOL' in v) obj[k] = !!v.BOOL;
    else obj[k] = v; // fallback
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
