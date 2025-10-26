import aws_cdk as cdk
from aws_cdk import (
    Stack,
    aws_s3 as s3,
)
from constructs import Construct


class Part3Stack(Stack):
    def __init__(self, scope: Construct, construct_id: str, *, site_bucket_name: str | None = None, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # 後でAPI Gateway + Lambda + S3を追加する前提の最小S3
        bucket_kwargs: dict = dict(
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            auto_delete_objects=True,
            removal_policy=cdk.RemovalPolicy.DESTROY,
            enforce_ssl=True,
            website_index_document="index.html",
        )
        if site_bucket_name:
            bucket_kwargs["bucket_name"] = site_bucket_name

        self.site_bucket = s3.Bucket(self, "SiteBucket", **bucket_kwargs)
