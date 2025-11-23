#!/bin/bash

# Raspberry Pi Cameraのプレビュー表示スクリプト
# GStreamerを使用してカメラ映像をリアルタイム表示
#
# 使い方:
#   chmod +x camera-preview.sh
#   ./camera-preview.sh

gst-launch-1.0 libcamerasrc af-mode=2 ! video/x-raw,width=1920,height=1280,framerate=30/1 ! autovideosink
