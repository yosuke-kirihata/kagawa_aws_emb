import * as cdk from 'aws-cdk-lib';
import { 
  aws_s3 as s3,
  aws_dynamodb as dynamodb,
  aws_lambda as lambda,
  aws_lambda_nodejs as lambdaNodejs,
  aws_iam as iam,
} from 'aws-cdk-lib';
import { aws_s3_notifications as s3n } from 'aws-cdk-lib';
import path from 'node:path';

export class Part2Stack extends cdk.Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);

    const { imageBucketName, ddbTableName } = props;

    if (!imageBucketName) {
      throw new Error('IMAGE_BUCKET_NAME is required (existing S3 bucket)');
    }
    if (!ddbTableName) {
      throw new Error('DDB_TABLE_NAME is required (existing DynamoDB table)');
    }

    const bucket = s3.Bucket.fromBucketName(this, 'ExistingImageBucket', imageBucketName);
    const table = dynamodb.Table.fromTableName(this, 'ExistingDynamoTable', ddbTableName);

    const describeFn = new lambdaNodejs.NodejsFunction(this, 'ImageDescribeFn', {
      entry: path.resolve('lambda/part2-handler.js'),
      runtime: lambda.Runtime.NODEJS_LATEST,
      memorySize: 512,
      timeout: cdk.Duration.seconds(60),
      environment: {
        TABLE_NAME: ddbTableName,
        DDB_PK: 'image_id',
      },
    });

    new lambda.EventInvokeConfig(this, 'ImageDescribeFnInvokeConfig', {
      function: describeFn,
      retryAttempts: 0,
    });

    bucket.grantRead(describeFn);
    table.grantReadWriteData(describeFn);
    describeFn.addToRolePolicy(new iam.PolicyStatement({ actions: ['bedrock:InvokeModel'], resources: ['*'] }));

    const dest = new s3n.LambdaDestination(describeFn);
    bucket.addEventNotification(s3.EventType.OBJECT_CREATED_PUT, dest, { prefix: 'uploads/' });
  }
}
