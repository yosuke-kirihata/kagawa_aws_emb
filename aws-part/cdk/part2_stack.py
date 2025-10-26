from typing import Optional

import aws_cdk as cdk
from aws_cdk import (
    Stack,
    aws_s3 as s3,
    aws_dynamodb as dynamodb,
)
from constructs import Construct


class Part2Stack(Stack):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        existing_table_name: Optional[str] = None,
        image_bucket_name: Optional[str] = None,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # 最小: 空のS3バケット（削除容易な開発用設定）
        self.bucket = s3.Bucket(
            self,
            "ImageBucket",
            bucket_name=image_bucket_name,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            auto_delete_objects=True,
            removal_policy=cdk.RemovalPolicy.DESTROY,
            enforce_ssl=True,
        )

        # 既存DynamoDBを参照（存在する場合のみ）
        table_name = existing_table_name or self.node.try_get_context("ddbTableName")
        if table_name:
            self.existing_table = dynamodb.Table.from_table_name(
                self, "ExistingDynamoTable", table_name=table_name
            )

        # ここに後で: S3->Lambda->Bedrock の配線を追加予定
