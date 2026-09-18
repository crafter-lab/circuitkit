circuit audio_system v1
title "Reusable audio subsystem"
view schematic

define AudioUnit (VIN GND BCLK WS DATA OUT+ OUT-) {
  amp: amplifier "MAX98357" (VIN GND BCLK LRC/WS DIN SPK+ "SPK−")

  expose VIN = amp.VIN
  expose GND = amp.GND
  expose BCLK = amp.BCLK
  expose WS = amp.LRC/WS
  expose DATA = amp.DIN
  expose OUT+ = amp.SPK+
  expose OUT- = amp."SPK−"
}

ESP32: controller "ESP32 Dev Board" (5V/VIN GND GPIO26 GPIO25 GPIO27)
audio: AudioUnit "Audio subsystem"
Speaker: speaker (+ "−")

power ESP32.5V/VIN -- audio.VIN "5V/VIN"
ground ESP32.GND -- audio.GND
bus I2S {
  ESP32.GPIO26 -> audio.BCLK "BCLK"
  ESP32.GPIO25 -> audio.WS "LRC/WS"
  ESP32.GPIO27 -> audio.DATA "DIN"
}
audio audio.OUT+ -> Speaker.+
audio audio.OUT- -> Speaker."−"
