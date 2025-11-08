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

    const { ddbTableName, ddbGsiName, imageBucketName } = props;

    if (!ddbTableName || !ddbGsiName) return;

    const table = dynamodb.Table.fromTableName(this, 'ApiDataTable', ddbTableName);

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

    const api = new apigw.RestApi(this, 'Part3Api', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: ['GET'],
      },
    });
    const data = api.root.addResource('data');
    const byDevice = data.addResource('{device_id}');
    byDevice.addMethod('GET', new apigw.LambdaIntegration(apiFn));
    const imageUrl = api.root.addResource('image-url');
    const imageByDev = imageUrl.addResource('{device_id}');
    const imageByDevAndId = imageByDev.addResource('{image_id}');
    imageByDevAndId.addMethod('GET', new apigw.LambdaIntegration(apiFn));
  }
}
