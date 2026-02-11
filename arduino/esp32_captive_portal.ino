#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_BME280.h>
#include "mbedtls/sha1.h"
#include "time.h"
#include <math.h>
#include "esp_sleep.h"

#define BTN_PIN 7              // long press to force provisioning
#define AP_SSID "invirosense-setup"
#define AP_PASS "12345678"     // at least 8 chars
#define DNS_PORT 53

// Supabase
const char* SUPABASE_URL = "https://ejtccsagughlsoqikobz.supabase.co";
const char* SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqdGNjc2FndWdobHNvcWlrb2J6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwMDY4NDcsImV4cCI6MjA3MjU4Mjg0N30.5fs9_GgbcjvTHpPBGhKHmlZ-PVP3BeAMIwITJd5VpTE";

// Claim namespace (must match web app)
const char* CLAIM_NAMESPACE_UUID = "9f0f1b2e-4b7c-4d1c-9f2a-0b6a2e0b1f5a";

Preferences prefs;
WebServer server(80);
DNSServer dns;

Adafruit_BME280 bme;

String savedSSID;
String savedPASS;
String ingestKey;
String deviceName;
String storedDeviceId;
uint32_t sampleIntervalMin = 15;

bool provisioning = false;
bool timeReady = false;
const long GMT_OFFSET_SEC = 0;
const int DAYLIGHT_OFFSET_SEC = 0;
const char* NTP_SERVER = "pool.ntp.org";
bool i2cScanned = false;

struct Reading {
  int64_t ts;
  float temp_c;
  float rh;
};

const int MAX_BUFFERED_READINGS = 5;
RTC_DATA_ATTR int bufferedCount = 0;
RTC_DATA_ATTR Reading bufferedReadings[MAX_BUFFERED_READINGS];

// ---------- UUIDv5 helpers ----------
void hexCharToByte(char c, uint8_t &val) {
  if (c >= '0' && c <= '9') val = c - '0';
  else if (c >= 'a' && c <= 'f') val = c - 'a' + 10;
  else if (c >= 'A' && c <= 'F') val = c - 'A' + 10;
  else val = 0;
}

void uuidToBytes(const String &uuid, uint8_t out[16]) {
  int j = 0;
  for (int i = 0; i < uuid.length() && j < 16; ) {
    if (uuid[i] == '-') { i++; continue; }
    uint8_t hi, lo;
    hexCharToByte(uuid[i++], hi);
    hexCharToByte(uuid[i++], lo);
    out[j++] = (hi << 4) | lo;
  }
}

String bytesToUuid(const uint8_t in[16]) {
  char buf[37];
  snprintf(buf, sizeof(buf),
    "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
    in[0], in[1], in[2], in[3], in[4], in[5], in[6], in[7],
    in[8], in[9], in[10], in[11], in[12], in[13], in[14], in[15]
  );
  return String(buf);
}

String uuidV5FromMac(const String &mac) {
  uint8_t ns[16];
  uuidToBytes(String(CLAIM_NAMESPACE_UUID), ns);

  String name = mac;
  name.toLowerCase();

  uint8_t input[16 + 32];
  memcpy(input, ns, 16);
  int nameLen = name.length();
  memcpy(input + 16, name.c_str(), nameLen);

  uint8_t hash[20];
  mbedtls_sha1(input, 16 + nameLen, hash);

  uint8_t uuid[16];
  memcpy(uuid, hash, 16);

  uuid[6] = (uuid[6] & 0x0F) | 0x50; // version 5
  uuid[8] = (uuid[8] & 0x3F) | 0x80; // variant RFC4122

  return bytesToUuid(uuid);
}

String redactKey(const String &key) {
  if (key.length() <= 6) return String("<redacted>");
  return key.substring(0, 6) + String("...");
}

bool extractJsonString(const String &json, const char *key, String &out) {
  String needle = String("\"") + key + "\":";
  int start = json.indexOf(needle);
  if (start < 0) return false;
  int valStart = start + needle.length();
  while (valStart < json.length() && json[valStart] == ' ') valStart++;
  if (json.startsWith("null", valStart)) return false;
  int q1 = json.indexOf("\"", valStart);
  int q2 = json.indexOf("\"", q1 + 1);
  if (q1 < 0 || q2 < 0) return false;
  out = json.substring(q1 + 1, q2);
  return out.length() > 0;
}

bool extractJsonNumber(const String &json, const char *key, long &out) {
  String needle = String("\"") + key + "\":";
  int start = json.indexOf(needle);
  if (start < 0) return false;
  int valStart = start + needle.length();
  while (valStart < json.length() && json[valStart] == ' ') valStart++;
  int end = valStart;
  while (end < json.length() && (isDigit(json[end]) || json[end] == '.' || json[end] == '-')) {
    end++;
  }
  if (end == valStart) return false;
  out = json.substring(valStart, end).toInt();
  return true;
}

uint32_t clampIntervalMin(long v) {
  if (v < 5) return 5;
  if (v > 120) return 120;
  return (uint32_t)(v - (v % 5));
}

void goToSleep() {
  uint64_t us = (uint64_t)sampleIntervalMin * 60ULL * 1000000ULL;
  Serial.print("Sleeping for ");
  Serial.print(sampleIntervalMin);
  Serial.println(" minutes.");
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  delay(50);
  esp_sleep_enable_timer_wakeup(us);
  Serial.flush();
  esp_deep_sleep_start();
}

bool readBmeForced(float &temp, float &hum, float &pressure) {
  if (!bme.takeForcedMeasurement()) return false;
  delay(200);
  temp = bme.readTemperature();
  hum = bme.readHumidity();
  pressure = bme.readPressure();
  return !(isnan(temp) || isnan(hum));
}

bool isoFromEpoch(time_t t, String &out) {
  struct tm tmUtc;
  if (!gmtime_r(&t, &tmUtc)) return false;
  char buf[25];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tmUtc);
  out = String(buf);
  return true;
}

void bufferReading(int64_t ts, float temp, float hum) {
  if (bufferedCount < MAX_BUFFERED_READINGS) {
    bufferedReadings[bufferedCount++] = {ts, temp, hum};
    return;
  }
  for (int i = 1; i < MAX_BUFFERED_READINGS; i++) {
    bufferedReadings[i - 1] = bufferedReadings[i];
  }
  bufferedReadings[MAX_BUFFERED_READINGS - 1] = {ts, temp, hum};
}

void clearBufferedReadings() {
  bufferedCount = 0;
}

// ---------- Captive portal ----------
const char* portalHtml = R"HTML(
<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invirosense Setup</title>
<style>
body{font-family:system-ui;margin:20px;background:#f8fafc;color:#0f172a}
.card{background:#fff;padding:16px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
label{display:block;margin-top:10px;font-size:14px}
input{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px}
button{margin-top:12px;background:#0f172a;color:#fff;border:0;padding:10px 14px;border-radius:10px;font-weight:600}
</style></head>
<body>
<div class="card">
<h2>Invirosense Setup</h2>
<form method="POST" action="/save">
<label>Device Name</label>
<input name="name" placeholder="Basement Sensor" />
<label>Wi‑Fi SSID</label>
<input name="ssid" required />
<label>Wi‑Fi Password</label>
<input name="pass" type="password" />
<label>Claim Code</label>
<input name="code" required />
<button type="submit">Connect</button>
</form>
</div>
</body>
</html>
)HTML";

const char* savedHtml = R"HTML(
<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="3">
<title>Saved</title>
<style>
body{font-family:system-ui;margin:20px;background:#f8fafc;color:#0f172a}
.card{background:#fff;padding:16px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
</style></head>
<body>
<div class="card">
<h3>Saved</h3>
<p>Device will now connect and claim. You can close this page.</p>
</div>
</body>
</html>
)HTML";

void handleRoot() {
  server.send(200, "text/html", portalHtml);
}

void handleSave() {
  if (!server.hasArg("ssid") || !server.hasArg("code")) {
    server.send(400, "text/plain", "Missing fields");
    return;
  }

  String ssid = server.arg("ssid");
  String pass = server.arg("pass");
  String code = server.arg("code");
  String name = server.hasArg("name") ? server.arg("name") : "";

  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.putString("claim_code", code);
  prefs.putString("device_name", name);

  server.send(200, "text/html", savedHtml);
  Serial.println("Saved Wi-Fi + claim code. Rebooting to connect...");
  delay(1000);
  ESP.restart();
}

void startPortal() {
  provisioning = true;
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(AP_SSID, AP_PASS);

  dns.start(DNS_PORT, "*", WiFi.softAPIP());
  server.on("/", handleRoot);
  server.on("/save", HTTP_POST, handleSave);
  server.begin();
}

bool connectWiFi() {
  if (savedSSID.length() == 0) return false;
  WiFi.mode(WIFI_STA);
  WiFi.begin(savedSSID.c_str(), savedPASS.c_str());

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(250);
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Wi-Fi connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Wi-Fi connect failed.");
  }
  return WiFi.status() == WL_CONNECTED;
}

void initTime() {
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);
  struct tm timeinfo;
  for (int i = 0; i < 20; i += 1) {
    if (getLocalTime(&timeinfo)) {
      timeReady = true;
      Serial.println("NTP time synced.");
      return;
    }
    delay(500);
  }
  Serial.println("NTP sync failed.");
}

String isoNow() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) return String("");
  char buf[25];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buf);
}

void scanI2C() {
  if (i2cScanned) return;
  i2cScanned = true;
  Serial.println("I2C scan...");
  byte count = 0;
  for (byte address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    byte error = Wire.endTransmission();
    if (error == 0) {
      Serial.print("I2C device found at 0x");
      if (address < 16) Serial.print("0");
      Serial.println(address, HEX);
      count++;
    }
  }
  if (count == 0) {
    Serial.println("No I2C devices found.");
  }
}

bool claimDevice(const String &claimCode) {
  String mac = WiFi.macAddress();
  String deviceId = uuidV5FromMac(mac);
  Serial.print("Claiming device ");
  Serial.println(deviceId);

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/functions/v1/claim";
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);

  String body = String("{\"device_id\":\"") + deviceId +
                String("\",\"claim_code\":\"") + claimCode + "\"";
  if (deviceName.length()) {
    body += String(",\"device_name\":\"") + deviceName + "\"";
  }
  body += "}";

  int code = http.POST(body);
  String resp = http.getString();
  http.end();

  Serial.print("Claim response: ");
  Serial.println(resp);

  if (code == 200) {
    String respDeviceId;
    if (extractJsonString(resp, "device_id", respDeviceId)) {
      prefs.putString("device_id", respDeviceId);
      storedDeviceId = respDeviceId;
      Serial.print("Claim response device_id: ");
      Serial.println(respDeviceId);
    }

    String key;
    if (extractJsonString(resp, "ingest_key", key)) {
      prefs.putString("ingest_key", key);
      Serial.print("Claim response ingest_key (prefix): ");
      Serial.println(redactKey(key));
      Serial.println("Claim OK. Ingest key saved.");
      return true;
    }
    Serial.println("Claim response missing ingest_key; not saving.");
  } else {
    Serial.print("Claim failed: ");
    Serial.println(resp);
  }
  return false;
}

void sendReading() {
  float t1, h1, p1;
  float t2, h2, p2;
  float t3, h3, p3;
  if (!readBmeForced(t1, h1, p1) || !readBmeForced(t2, h2, p2) || !readBmeForced(t3, h3, p3)) {
    Serial.println("Sensor not ready; skipping.");
    return;
  }
  // Discard first reading, average last two.
  float temp = (t2 + t3) / 2.0f;
  float hum = (h2 + h3) / 2.0f;
  float pressure = (p2 + p3) / 2.0f;
  Serial.print("Reading: temp_c=");
  Serial.print(temp, 2);
  Serial.print(" rh=");
  Serial.print(hum, 2);
  Serial.print(" pressure_pa=");
  Serial.println(pressure, 2);

  if (!ingestKey.length()) return;
  if (!timeReady) initTime();
  String deviceId = storedDeviceId.length() ? storedDeviceId : uuidV5FromMac(WiFi.macAddress());
  Serial.print("Ingest device_id: ");
  Serial.println(deviceId);
  Serial.print("Ingest key (prefix): ");
  Serial.println(redactKey(ingestKey));

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/functions/v1/ingest";
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);

  String nowIso = isoNow();
  if (!nowIso.length()) {
    Serial.println("No time available; skipping ingest.");
    return;
  }

  String readingsJson = "";
  for (int i = 0; i < bufferedCount; i++) {
    String tsIso;
    if (!isoFromEpoch((time_t)bufferedReadings[i].ts, tsIso)) continue;
    if (readingsJson.length()) readingsJson += ",";
    readingsJson += String("{\"ts\":\"") + tsIso +
                    String("\",\"temp_c\":") + String(bufferedReadings[i].temp_c, 2) +
                    String(",\"rh\":") + String(bufferedReadings[i].rh, 2) + "}";
  }
  if (readingsJson.length()) readingsJson += ",";
  readingsJson += String("{\"ts\":\"") + nowIso +
                  String("\",\"temp_c\":") + String(temp, 2) +
                  String(",\"rh\":") + String(hum, 2) + "}";

  String body = String("{\"device_id\":\"") + deviceId +
                String("\",\"ingest_key\":\"") + ingestKey +
                String("\",\"readings\":[") + readingsJson + "]}";

  int code = http.POST(body);
  String resp = http.getString();
  Serial.print("Ingest status: ");
  Serial.println(code);
  if (code >= 400) {
    Serial.print("Ingest error body: ");
    Serial.println(resp);
    time_t nowEpoch = time(nullptr);
    if (nowEpoch > 0) {
      bufferReading((int64_t)nowEpoch, temp, hum);
      Serial.print("Buffered readings: ");
      Serial.println(bufferedCount);
    }
  } else {
    long nextMin = 0;
    if (extractJsonNumber(resp, "interval_min", nextMin)) {
      sampleIntervalMin = clampIntervalMin(nextMin);
      prefs.putUInt("interval_min", sampleIntervalMin);
      Serial.print("Updated interval_min: ");
      Serial.println(sampleIntervalMin);
    }
    clearBufferedReadings();
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  Serial.println("Booting...");
  pinMode(BTN_PIN, INPUT_PULLUP);

  prefs.begin("invirosense", false);
  savedSSID = prefs.getString("ssid", "");
  savedPASS = prefs.getString("pass", "");
  ingestKey = prefs.getString("ingest_key", "");
  deviceName = prefs.getString("device_name", "");
  storedDeviceId = prefs.getString("device_id", "");
  sampleIntervalMin = prefs.getUInt("interval_min", 15);
  String claimCode = prefs.getString("claim_code", "");
  Serial.print("Stored claim code present: ");
  Serial.println(claimCode.length() > 0 ? "yes" : "no");
  Serial.print("Stored ingest key (prefix): ");
  Serial.println(ingestKey.length() > 0 ? redactKey(ingestKey) : String("<empty>"));

  Wire.begin(D4, D5);
  scanI2C();
  bme.begin(0x76);
  bme.setSampling(Adafruit_BME280::MODE_FORCED,
                  Adafruit_BME280::SAMPLING_X1,
                  Adafruit_BME280::SAMPLING_X1,
                  Adafruit_BME280::SAMPLING_X1,
                  Adafruit_BME280::FILTER_OFF,
                  Adafruit_BME280::STANDBY_MS_0_5);

  if (digitalRead(BTN_PIN) == LOW || savedSSID.length() == 0) {
    Serial.println("Starting captive portal...");
    startPortal();
    return;
  }

  if (!connectWiFi()) {
    Serial.println("Falling back to captive portal...");
    startPortal();
    return;
  }

  Serial.print("Boot device_id: ");
  Serial.println(storedDeviceId.length() ? storedDeviceId : uuidV5FromMac(WiFi.macAddress()));

  if (ingestKey.length() == 0 && claimCode.length() > 0) {
    Serial.println("No ingest key found; attempting claim.");
    if (claimDevice(claimCode)) {
      ingestKey = prefs.getString("ingest_key", "");
      storedDeviceId = prefs.getString("device_id", storedDeviceId);
    }
  } else if (ingestKey.length() > 0) {
    Serial.println("Ingest key already stored; skipping claim.");
  } else {
    Serial.println("No claim code stored; skipping claim.");
  }

  if (!timeReady) {
    initTime();
  }
}

void loop() {
  if (provisioning) {
    dns.processNextRequest();
    server.handleClient();
    return;
  }

  sendReading();
  goToSleep();
}
