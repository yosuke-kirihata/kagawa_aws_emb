/*
  シリアルポート通信のサンプル

  使い方:
    node serial.js
*/
import { SerialPort, ReadlineParser } from "serialport";

// シリアルポート設定
const port = new SerialPort({
  path: "/dev/ttyACM0",
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
});

// シリアルポートが開いた時のイベントハンドラ
port.on("open", function () {
  console.log("Serial port opened successfully");
});

// シリアルポートエラー時のイベントハンドラ
port.on("error", function (err) {
  console.error("Serial port error:", err.message);
});

// パーサー設定: 改行区切りでデータを分割
// Arduinoから送られてくるデータを1行ずつ処理するため
const parser = new ReadlineParser({ delimiter: "\r\n" });
port.pipe(parser);  // シリアルポートの出力をパーサーに渡す

// データ受信時のイベントハンドラ
// パーサーが1行分のデータを受け取るたびに実行される
parser.on("data", function (data) {
  console.log(data.toString());  // 受信データを文字列として表示
});

// パーサーエラー時のイベントハンドラ
parser.on("error", function (err) {
  console.error("Parser error:", err);
});