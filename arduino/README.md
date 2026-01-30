ESP32 (XIAO ESP32-C3) Captive Portal

Files
- esp32_captive_portal.ino

Wiring (BME280 I2C)
- VCC -> 3V3
- GND -> GND
- SDA -> SDA (default I2C)
- SCL -> SCL (default I2C)

Notes
- Update SUPABASE_URL and SUPABASE_ANON_KEY in the sketch.
- Default setup/reset button pin is GPIO7 (INPUT_PULLUP).
- Captive portal SSID: invirosense-setup / Password: 12345678
