import * as cdk from 'aws-cdk-lib';
import { aws_s3 as s3 } from 'aws-cdk-lib';

export class Part3Stack extends cdk.Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);

    const { siteBucketName } = props;

    const bucketProps = {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      enforceSSL: true,
      websiteIndexDocument: 'index.html',
    };
    if (siteBucketName) bucketProps.bucketName = siteBucketName;

    this.siteBucket = new s3.Bucket(this, 'SiteBucket', bucketProps);
  }
}
