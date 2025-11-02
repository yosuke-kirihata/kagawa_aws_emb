import 'dotenv/config';
import * as cdk from 'aws-cdk-lib';
import { Part2Stack } from '../lib/part2-stack.js';
import { Part3Stack } from '../lib/part3-stack.js';

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

const app = new cdk.App();

const deployAccount = process.env.DEPLOY_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT;
const deployRegion = process.env.DEPLOY_REGION || process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;

const env = { account: deployAccount, region: deployRegion };

const deviceId = process.env.DEVICE_ID || 'local';
const suffix = normalize(deviceId);

// 既存リソース名を .env から取得（必須）
const imageBucketName = process.env.IMAGE_BUCKET_NAME;
const ddbTableName = process.env.DDB_TABLE_NAME;
const ddbGsiName = process.env.DDB_GSI_NAME;

new Part2Stack(app, `Part2Stack-${suffix}`, {
  env,
  imageBucketName,
  ddbTableName,
});

new Part3Stack(app, `Part3Stack-${suffix}`, {
  env,
  ddbTableName,
  ddbGsiName,
});

app.synth();
