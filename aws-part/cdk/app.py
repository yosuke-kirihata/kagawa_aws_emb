#!/usr/bin/env python3
import os
import re

import aws_cdk as cdk
from dotenv import load_dotenv

from part2_stack import Part2Stack
from part3_stack import Part3Stack


def _normalize_for_suffix(value: str) -> str:
    # S3バケット名/スタック名の一部に使えるよう簡易正規化
    return re.sub(r"[^a-z0-9-]", "-", value.lower())


# .env を読み込む（同ディレクトリの .env を想定）
load_dotenv()

app = cdk.App()

env = cdk.Environment(
    account=os.getenv("CDK_DEFAULT_ACCOUNT"),
    region=os.getenv("CDK_DEFAULT_REGION"),
)

stage = os.getenv("STAGE", "dev")
student_id = os.getenv("STUDENT_ID", "local")
suffix = _normalize_for_suffix(f"{stage}-{student_id}")

account = os.getenv("CDK_DEFAULT_ACCOUNT", "")
region = os.getenv("CDK_DEFAULT_REGION", "")

image_bucket_name = f"kagawa-emb-img-{suffix}-{account}"
site_bucket_name = f"kagawa-emb-site-{suffix}-{account}"

existing_ddb_table = os.getenv("DDB_TABLE_NAME")

Part2Stack(
    app,
    f"Part2Stack-{suffix}",
    env=env,
    description="S3-Lambda-Bedrock minimal skeleton",
    existing_table_name=existing_ddb_table,
    image_bucket_name=image_bucket_name,
)

Part3Stack(
    app,
    f"Part3Stack-{suffix}",
    env=env,
    description="Lambda-API Gateway-S3 minimal skeleton",
    site_bucket_name=site_bucket_name,
)

app.synth()
