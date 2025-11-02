#!/bin/zsh

# エンドポイント確認
aws iot describe-endpoint --endpoint-type iot:Data-ATS --query endpointAddress --output text

# 購読
IOT_ENDPOINT=$(aws iot describe-endpoint --endpoint-type iot:Data-ATS --query endpointAddress --output text --region ap-northeast-1)
IOT_TOPIC="Your default topic"
IOT_CERT_FILE="Your certificate file"
IOT_KEY_FILE="Your private key"
IOT_CA_FILE="Your CA file"

mosquitto_sub -d -h $IOT_ENDPOINT \
    --cafile $IOT_CA_FILE \
    --cert $IOT_CERT_FILE \
    --key $IOT_KEY_FILE \
    -t $IOT_TOPIC
