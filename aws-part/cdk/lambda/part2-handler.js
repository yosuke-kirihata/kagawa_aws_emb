import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient, UpdateItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { Readable } from 'node:stream';

const s3 = new S3Client({});
const ddb = new DynamoDBClient({});
const bedrock = new BedrockRuntimeClient({});

const TABLE_NAME = process.env.TABLE_NAME;
const DDB_PK = 'image_id';
const MODEL_ID = 'amazon.nova-lite-v1:0';

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(Buffer.from(c)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

export const handler = async (event) => {
  let bucket;
  let key;
  if (event?.Records?.[0]?.s3) {
    const record = event.Records[0];
    bucket = record.s3.bucket.name;
    key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
  } else {
    console.log('Unexpected event (expecting S3 Put)', JSON.stringify(event));
    return;
  }

  const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const imageBytes = await streamToBuffer(obj.Body instanceof Readable ? obj.Body : Readable.from(obj.Body));
  const base64Image = imageBytes.toString('base64');

  const body = {
    messages: [
      {
        role: 'user',
        content: [
          { text: 'この画像の内容を100文字以内で日本語で説明してください。' },
          { image: { format: 'jpeg', source: { bytes: base64Image } } },
        ],
      },
    ],
    inferenceConfig: { maxTokens: 300, temperature: 0.3, topP: 0.9 },
  };

  const resp = await bedrock.send(
    new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(body),
    })
  );

  const respText = new TextDecoder().decode(resp.body);
  const json = JSON.parse(respText);
  const description = json?.output?.message?.content?.find?.((c) => c.text)?.text
    || json?.results?.[0]?.outputText
    || json?.outputText
    || respText;

  const parts = key.split('/');
  const imageId = parts[parts.length - 1];
  const keyMap = { [DDB_PK]: { S: imageId } };

  try {
    await ddb.send(
      new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: keyMap,
        UpdateExpression: 'SET #d = :desc, #s = :status',
        ExpressionAttributeNames: { '#d': 'description', '#s': 'status' },
        ExpressionAttributeValues: { ':desc': { S: description }, ':status': { S: 'COMPLETE' } },
      })
    );
  } catch (e) {
    console.error('DDB Update failed (no Put fallback)', { error: String(e), table: TABLE_NAME, keyMap });
    throw e;
  }
};
