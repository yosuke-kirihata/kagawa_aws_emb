import * as cdk from 'aws-cdk-lib';
import { aws_s3 as s3, aws_dynamodb as dynamodb } from 'aws-cdk-lib';

export class Part2Stack extends cdk.Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);

    const { imageBucketName, existingTableName } = props;

    const bucketProps = {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      enforceSSL: true,
    };
    if (imageBucketName) bucketProps.bucketName = imageBucketName;

    this.bucket = new s3.Bucket(this, 'ImageBucket', bucketProps);

    if (existingTableName) {
      this.existingTable = dynamodb.Table.fromTableName(this, 'ExistingDynamoTable', existingTableName);
    }
  }
}
