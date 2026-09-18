circuit sensor-demo v1
title "Temperature sensor"
view wiring

controller: module (3V3 GND SDA SCL)
sensor: module (VCC GND SDA SCL)

power controller.3V3 -- sensor.VCC "3V3"
ground controller.GND -- sensor.GND
bus I2C {
  controller.SDA -- sensor.SDA "SDA"
  controller.SCL -- sensor.SCL "SCL"
}
