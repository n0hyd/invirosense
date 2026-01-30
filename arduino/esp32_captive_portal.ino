#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_BME280.h>
#include "mbedtls/sha1.h"

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

bool provisioning = false;

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

  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.putString("claim_code", code);

  server.send(200, "text/plain", "Saved. Device will now connect and claim.");
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
  return WiFi.status() == WL_CONNECTED;
}

bool claimDevice(const String &claimCode) {
  String mac = WiFi.macAddress();
  String deviceId = uuidV5FromMac(mac);

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/functions/v1/claim";
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);

  String body = String("{\"device_id\":\"") + deviceId +
                String("\",\"claim_code\":\"") + claimCode + "\"}";

  int code = http.POST(body);
  String resp = http.getString();
  http.end();

  if (code == 200 && resp.indexOf("ingest_key") >= 0) {
    int start = resp.indexOf("ingest_key");
    int q1 = resp.indexOf(":", start);
    int q2 = resp.indexOf("\"", q1 + 2);
    int q3 = resp.indexOf("\"", q2 + 1);
    String key = resp.substring(q2 + 1, q3);
    prefs.putString("ingest_key", key);
    return true;
  }
  return false;
}

void sendReading() {
  if (!ingestKey.length()) return;

  float temp = bme.readTemperature();
  float hum = bme.readHumidity();
  String mac = WiFi.macAddress();
  String deviceId = uuidV5FromMac(mac);

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/functions/v1/ingest";
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);

  String nowIso = "2026-01-30T00:00:00Z"; // TODO: replace with real clock
  String body = String("{\"device_id\":\"") + deviceId +
                String("\",\"ingest_key\":\"") + ingestKey +
                String("\",\"readings\":[{\"ts\":\"") + nowIso +
                String("\",\"temp_c\":") + String(temp, 2) +
                String(",\"rh\":") + String(hum, 2) + "}]}";

  http.POST(body);
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(BTN_PIN, INPUT_PULLUP);

  prefs.begin("invirosense", false);
  savedSSID = prefs.getString("ssid", "");
  savedPASS = prefs.getString("pass", "");
  ingestKey = prefs.getString("ingest_key", "");
  String claimCode = prefs.getString("claim_code", "");

  Wire.begin();
  bme.begin(0x76);

  if (digitalRead(BTN_PIN) == LOW || savedSSID.length() == 0) {
    startPortal();
    return;
  }

  if (!connectWiFi()) {
    startPortal();
    return;
  }

  if (ingestKey.length() == 0 && claimCode.length() > 0) {
    if (claimDevice(claimCode)) {
      ingestKey = prefs.getString("ingest_key", "");
    }
  }
}

void loop() {
  if (provisioning) {
    dns.processNextRequest();
    server.handleClient();
    return;
  }

  static unsigned long lastSend = 0;
  if (millis() - lastSend > 60000) {
    lastSend = millis();
    sendReading();
  }
}
