/**
 * GStreamerを使ってカメラ画像をキャプチャするサンプル
 * 
 * - libcamerasrc（Raspberry Pi Camera用のGStreamerプラグイン）で画像を取得
 * - JPEG形式で指定パスに保存
 * - カメラ起動の安定化のため3秒のウォームアップ時間を設定
 * 
 * 使い方:
 *   node camera-capture.js [出力ファイル名]
 * 
 * 例:
 *   node camera-capture.js test.jpg
 *   node camera-capture.js  # デフォルトでcaptured-image.jpgに保存
 * 
 * 前提条件:
 *   - GStreamerとlibcamerasrcプラグインがインストール済みであること
 *   - Raspberry Piカメラモジュールが接続されていること
 * GStreamerコマンド例（動作確認用）:
 *   gst-launch-1.0 libcamerasrc af-mode=2 ! video/x-raw,width=1920,height=1280,framerate=30/1 ! autovideosink
 * 
 */
import { createRequire } from "module";
import fs from "fs";

// CommonJSモジュールを読み込むためのrequireを作成
const require = createRequire(import.meta.url);
const GStreamer = require("gstreamer-superficial");

// GStreamerで画像をキャプチャする関数
async function captureImageWithGStreamer(outputPath) {
  return new Promise((resolve, reject) => {
    const pipelineStr = `
libcamerasrc af-mode=2 ! video/x-raw,width=1920,height=1080,framerate=30/1 ! 
videorate ! 
identity drop-allocation=true ! 
jpegenc ! 
multifilesink location=${outputPath} max-files=1
`;

    const pipeline = new GStreamer.Pipeline(pipelineStr.trim());
    pipeline.play();

    console.log("Capturing image with GStreamer (with warm-up)...");

    // 3秒待ってカメラ起動を安定化
    setTimeout(() => {
      pipeline.stop();
      console.log(`Image saved as '${outputPath}'`);
      resolve();
    }, 3000);
  });
}

async function main() {
  // 出力ファイル名を取得（コマンドライン引数または デフォルト値）
  const outputPath = process.argv[2] || "captured-image.jpg";

  try {
    // GStreamerで画像を撮影
    await captureImageWithGStreamer(outputPath);

    // 撮影した画像ファイルの存在確認
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      console.log(`\n=== Capture Completed ===`);
      console.log(`File: ${outputPath}`);
      console.log(`Size: ${stats.size} bytes`);
    } else {
      console.error(`Error: Captured image file not found: ${outputPath}`);
      process.exit(1);
    }
  } catch (error) {
    console.error("Error capturing image:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
