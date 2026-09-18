circuit audio v1
title "A digital audio signal path"
view wiring

ESP32: controller (GPIO26 GPIO25 GPIO27)
Amp: amplifier "MAX98357" (BCLK LRC/WS DIN SPK+ "SPK−")
Speaker: speaker (+ "−")

bus I2S {
  ESP32.GPIO26 -> Amp.BCLK
  ESP32.GPIO25 -> Amp.LRC/WS
  ESP32.GPIO27 -> Amp.DIN
}
audio Amp.SPK+ -- Speaker.+
audio Amp."SPK−" -- Speaker."−"

presentation {
  scene signals "Digital audio" {
    highlight module ESP32
    highlight module Amp
    dim others
    flow bus I2S {
      period 3s
    }
  }
  scene output "Speaker output" {
    highlight module Amp
    highlight module Speaker
    highlight link Amp.SPK+ -- Speaker.+
    highlight link Amp."SPK−" -- Speaker."−"
    dim others
  }
}
