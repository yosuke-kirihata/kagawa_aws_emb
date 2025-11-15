import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient, UpdateItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { Readable } from 'node:stream';

const s3 = new S3Client({});
const ddb = new DynamoDBClient({});
const bedrock = new BedrockRuntimeClient({});

const TABLE_NAME = process.env.TABLE_NAME;
const DDB_PK = 'image_id';
const MODEL_ID = 'jp.anthropic.claude-sonnet-4-5-20250929-v1:0';

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(Buffer.from(c)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}
// 画像がS3にアップロードされたら、この関数が起動します。
export const handler = async (event) => {
  let bucket;
  let key;
  if (event?.Records?.[0]?.s3) {
    // アップロードされた画像の情報を取得します。
    const record = event.Records[0];
    bucket = record.s3.bucket.name;
    key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
  } else {
    console.log('Unexpected event (expecting S3 Put)', JSON.stringify(event));
    return;
  }

  // アップロードされた画像を取得します。
  const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  // アップロードされた画像をBedrock APIに渡せるように加工します。
  const imageBytes = await streamToBuffer(obj.Body instanceof Readable ? obj.Body : Readable.from(obj.Body));
  const base64Image = imageBytes.toString('base64');

  // Bedrockに送信するプロンプトの内容をここで定義します。
  const body = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'この画像の内容を300文字以内で日本語で説明してください。' },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } },
        ],
      },
    ],
  };

  // Bedrock APIを実行し、結果を取得します。
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
  const description = json?.content?.[0]?.text || respText;

  const parts = key.split('/');
  const imageId = parts[parts.length - 1];
  const keyMap = { [DDB_PK]: { S: imageId } };

  try {
    // 生成AIのコメントを、DynamoDBに保存します。
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
