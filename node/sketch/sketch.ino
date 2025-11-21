#include <Arduino.h>
#include <SensirionI2cScd4x.h>
#include <Wire.h>
#include <Servo.h>

// macro definitions
// make sure that we use the proper definition of NO_ERROR
#ifdef NO_ERROR
#undef NO_ERROR
#endif
#define NO_ERROR 0

SensirionI2cScd4x sensor;

Servo myServo;

static char errorMessage[64];
static int16_t error;
static unsigned long lastMeasurementTime = 0;
const unsigned long MEASUREMENT_INTERVAL = 5000; // 5秒

static unsigned long servoMoveStartTime = 0; // サーボモーターの回転開始時刻
static bool isServoMoving = false;           // サーボモーターが回転中かどうか
static int servoTargetAngle = 0;             // サーボの目標角度
static int servoCurrentAngle = 0;            // サーボの現在の角度
static int servoDirection = 0;               // サーボの回転方向 (-1: 180度に向かって, 1: 0度に戻る)

void PrintUint64(uint64_t& value) {
    Serial.print("0x");
    Serial.print((uint32_t)(value >> 32), HEX);
    Serial.print((uint32_t)(value & 0xFFFFFFFF), HEX);
}

// SCD40センサーから測定値を取得して出力する関数
void readAndPrintSensorData() {
    bool dataReady = false;
    uint16_t co2Concentration = 0;
    float temperature = 0.0;
    float relativeHumidity = 0.0;

    // データが準備できているか確認
    error = sensor.getDataReadyStatus(dataReady);
    if (error != NO_ERROR) {
        Serial.print("Error trying to execute getDataReadyStatus(): ");
        errorToString(error, errorMessage, sizeof errorMessage);
        Serial.println(errorMessage);
        return;
    }
    
    // データ準備完了まで待機
    while (!dataReady) {
        delay(100);
        error = sensor.getDataReadyStatus(dataReady);
        if (error != NO_ERROR) {
            Serial.print("Error trying to execute getDataReadyStatus(): ");
            errorToString(error, errorMessage, sizeof errorMessage);
            Serial.println(errorMessage);
            return;
        }
    }

    // センサー値を読み取り
    error = sensor.readMeasurement(co2Concentration, temperature, relativeHumidity);
    if (error != NO_ERROR) {
        Serial.print("Error trying to execute readMeasurement(): ");
        errorToString(error, errorMessage, sizeof errorMessage);
        Serial.println(errorMessage);
        return;
    }

    // 測定結果を出力（CSV形式: CO2,温度,湿度）
    Serial.print(co2Concentration);
    Serial.print(",");
    Serial.print(temperature);
    Serial.print(",");
    Serial.print(relativeHumidity);
    Serial.println();
}

// サーボモーターの始動前処理
void startServoMove()
{
    servoTargetAngle = 180;
    servoDirection = -1; // 180度に向かって回転
    servoCurrentAngle = 0;
    servoMoveStartTime = millis();
    isServoMoving = true;
}

// サーボモーターを動かす処理
void moveServo()
{
    unsigned long currentTime = millis();
    unsigned long elapsedTime = currentTime - servoMoveStartTime;

    // 2秒で180度回転する
    int moveDuration = 1000; // 1秒
    int angleDelta = map(elapsedTime, 0, moveDuration, 0, 180);

    if (servoDirection == -1)
    {
        servoCurrentAngle = angleDelta;
        if (servoCurrentAngle >= 180)
        {
            servoCurrentAngle = 180;
            servoDirection = 1; // 0度に戻る
            servoMoveStartTime = currentTime;
        }
    }
    else if (servoDirection == 1)
    {
        servoCurrentAngle = 180 - angleDelta;
        if (servoCurrentAngle <= 0)
        {
            servoCurrentAngle = 0;
            isServoMoving = false; // 動作終了
        }
    }

    myServo.write(servoCurrentAngle);
}

void setup() {

    Serial.begin(115200);
    while (!Serial) {
        delay(100);
    }
    Wire.begin();
    sensor.begin(Wire, SCD41_I2C_ADDR_62);

    uint64_t serialNumber = 0;
    delay(30);
    // Ensure sensor is in clean state
    error = sensor.wakeUp();
    if (error != NO_ERROR) {
        Serial.print("Error trying to execute wakeUp(): ");
        errorToString(error, errorMessage, sizeof errorMessage);
        Serial.println(errorMessage);
    }
    error = sensor.stopPeriodicMeasurement();
    if (error != NO_ERROR) {
        Serial.print("Error trying to execute stopPeriodicMeasurement(): ");
        errorToString(error, errorMessage, sizeof errorMessage);
        Serial.println(errorMessage);
    }
    error = sensor.reinit();
    if (error != NO_ERROR) {
        Serial.print("Error trying to execute reinit(): ");
        errorToString(error, errorMessage, sizeof errorMessage);
        Serial.println(errorMessage);
    }
    // Read out information about the sensor
    error = sensor.getSerialNumber(serialNumber);
    if (error != NO_ERROR) {
        Serial.print("Error trying to execute getSerialNumber(): ");
        errorToString(error, errorMessage, sizeof errorMessage);
        Serial.println(errorMessage);
        return;
    }
    Serial.print("serial number: ");
    PrintUint64(serialNumber);
    Serial.println();
    //
    // If temperature offset and/or sensor altitude compensation
    // is required, you should call the respective functions here.
    // Check out the header file for the function definitions.
    // Start periodic measurements (5sec interval)
    error = sensor.startPeriodicMeasurement();
    if (error != NO_ERROR) {
        Serial.print("Error trying to execute startPeriodicMeasurement(): ");
        errorToString(error, errorMessage, sizeof errorMessage);
        Serial.println(errorMessage);
        return;
    }
    //
    // If low-power mode is required, switch to the low power
    // measurement function instead of the standard measurement
    // function above. Check out the header file for the definition.
    // For SCD41, you can also check out the single shot measurement example.
    //

    // サーボモーターの初期設定
    myServo.attach(3); // サーボモーターをデジタルピン3に接続
    myServo.write(0);  // サーボを0度に設定
}

void loop() {
    unsigned long currentTime = millis();
    
    // 前回の測定から設定時間経過したかチェック
    if (currentTime - lastMeasurementTime >= MEASUREMENT_INTERVAL) {
        lastMeasurementTime = currentTime;
        
        // センサーデータを取得して出力
        readAndPrintSensorData();
    }
    
    // サーボモーター動作中なら動かす
    if (isServoMoving) {
        moveServo();
    }

    // シリアルコマンドを受けてサーボモータ制御を開始
    if (Serial.available() > 0)
    {
        // CRLFのLFまで受信し、CRを削除
        String command = Serial.readStringUntil('\n');
        command.trim();
        if (command == "ALERT")
        {
            startServoMove();
        }
    }
}
