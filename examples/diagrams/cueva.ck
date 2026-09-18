circuit cueva v1
title "USB-powered ESP32, OLED and audio"
view schematic

USB: connector (power)
ESP32: controller "ESP32 Dev Board" (USB 3V3 5V/VIN GND GPIO23 GPIO22 GPIO26 GPIO25 GPIO27)
OLED: display (VCC GND SDA SCL)
MAX98357: amplifier (VIN GND BCLK LRC/WS DIN SPK+ "SPK−")
Speaker: speaker (+ "−")

power USB.power -> ESP32.USB "USB module-level power"
power ESP32.3V3 -- OLED.VCC "3V3"
ground ESP32.GND -- OLED.GND
bus I2C {
  ESP32.GPIO23 <-> OLED.SDA "SDA"
  ESP32.GPIO22 <-> OLED.SCL "SCL"
}
power ESP32.5V/VIN -- MAX98357.VIN "5V/VIN"
ground ESP32.GND -- MAX98357.GND
bus I2S {
  ESP32.GPIO26 -> MAX98357.BCLK "BCLK"
  ESP32.GPIO25 -> MAX98357.LRC/WS "LRC/WS"
  ESP32.GPIO27 -> MAX98357.DIN "DIN"
}
audio MAX98357.SPK+ -> Speaker.+
audio MAX98357."SPK−" -> Speaker."−"
