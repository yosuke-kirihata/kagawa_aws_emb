import * as cdk from 'aws-cdk-lib';
import {
  aws_lambda as lambda,
  aws_lambda_nodejs as lambdaNodejs,
  aws_apigateway as apigw,
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_s3 as s3,
} from 'aws-cdk-lib';
import path from 'node:path';

export class Part3Stack extends cdk.Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);

    // 先に作ったDynamoDBとS3の情報, 設定するID, PWの情報を取得します。
    const { ddbTableName, ddbGsiName, imageBucketName, basicUser, basicPassword } = props;

    if (!ddbTableName || !ddbGsiName) return;

    // 先に作ったDynamoDBの情報を取得します。
    const table = dynamodb.Table.fromTableName(this, 'ApiDataTable', ddbTableName);

    // DynamoDBからデータを取得するためのLambda関数を作成します。
    const apiFn = new lambdaNodejs.NodejsFunction(this, 'QueryByDeviceApiFn', {
      entry: path.resolve('lambda/part3-api.js'),
      runtime: lambda.Runtime.NODEJS_LATEST,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: ddbTableName,
        GSI_NAME: ddbGsiName,
        PK_NAME: 'device_id',
        IMAGE_BUCKET_NAME: imageBucketName || '',
      },
    });
    table.grantReadData(apiFn);
    apiFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:Query'],
      resources: [
        `arn:${cdk.Aws.PARTITION}:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/${ddbTableName}/index/${ddbGsiName}`,
      ],
    }));
    if (imageBucketName) {
      const imageBucket = s3.Bucket.fromBucketName(this, 'ImageSrcBucket', imageBucketName);
      imageBucket.grantRead(apiFn);
    }

    // API Gatewayを作成します。
    const api = new apigw.RestApi(this, 'Part3Api', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: ['GET'],
      },
    });
    // Basic認証を行うためのLambda関数を作成します。
    const authFn = new lambdaNodejs.NodejsFunction(this, 'BasicAuthorizerFn', {
      entry: path.resolve('lambda/part3-auth-basic.js'),
      runtime: lambda.Runtime.NODEJS_LATEST,
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      environment: {
        BASIC_USER: basicUser || 'user',
        BASIC_PASSWORD: basicPassword || '',
      },
    });
    // Basic認証を行うためのAuthorizerに認証処理を行うLambdaを登録します。
    const authorizer = new apigw.TokenAuthorizer(this, 'BasicAuthorizer', {
      handler: authFn,
      identitySource: apigw.IdentitySource.header('Authorization'),
      resultsCacheTtl: cdk.Duration.seconds(0),
    });
    // データを取得するためのAPIを作成します。
    const data = api.root.addResource('data');
    const byDevice = data.addResource('{device_id}');
    byDevice.addMethod('GET', new apigw.LambdaIntegration(apiFn), {
      authorizer,
      authorizationType: apigw.AuthorizationType.CUSTOM,
    });
    // 画像のURLを取得するためのAPIを作成します。
    const imageUrl = api.root.addResource('image-url');
    const imageByDev = imageUrl.addResource('{device_id}');
    const imageByDevAndId = imageByDev.addResource('{image_id}');
    imageByDevAndId.addMethod('GET', new apigw.LambdaIntegration(apiFn), {
      authorizer,
      authorizationType: apigw.AuthorizationType.CUSTOM,
    });
  }
}
