# Tipos de diagrama y alcance de precisión

Dirección seleccionada por Hunter el 2026-09-16: especializar CircuitKit en bloques, conexiones y esquemas educativos; apoyar disposición física simplificada cuando la información lo permita. No ampliar este foco a CAD mecánico, PCB fabricable, generación de BOM o documentación de ensamblaje de producción. Las capacidades educativas existentes no se eliminan por esta decisión.

## No usar una escala de confianza 1, 2, 3

El número distingue una vista, no una certificación. Una imagen detallada puede tener menos evidencia que un mapa sencillo de cables. Cada figura debe comunicar por separado:

| Campo | Qué declara |
| --- | --- |
| Tipo | Bloques, conexión, esquemático o disposición simplificada |
| Abstracción | Funciones, terminales entre módulos, componentes o colocación |
| Validación | Propiedades concretas comprobadas y fuente utilizada |
| Fidelidad física | Verificada, esquemática/no a escala o desconocida |
| Límites | Lo que no se conoce o no se ha comprobado |

El tipo tampoco sustituye a `Panel.kind` ni a la etapa teaching/question/correction. Una vista de conexiones puede servir para una pregunta o una corrección.

## Ejemplo de Cueva

Las tres vistas se generan con las primitivas públicas y los exportadores SVG/PNG actuales. Sus etiquetas de tipo son visibles y accesibles; el manifiesto del ejemplo conserva los campos anteriores. Esta demostración no añade campos desconocidos al esquema público v2 ni afirma que el selector global de tipo ya esté integrado en todas las pantallas.

- Bloques: agrupa módulos y buses. No intenta dar instrucciones de conexión pin por pin.
- Conexión: conserva las once conexiones originales más la entrada USB, incluido GPIO23 para SDA.
- Esquemático modular: expresa las mismas conexiones como redes, símbolos de tierra, alimentación nominal, referencias de módulo y parlante de dos terminales. Se comprueba que su conectividad declarada coincide con la del mapa de cables.

Se conserva `5V/VIN` como nombre aportado, no como una medición garantizada. No se añaden resistencias pull-up de 4.7 kΩ, capacitores de 10 µF/100 nF, una impedancia de parlante, un modelo OLED SSD1306 ni detalles de regulación USB: esos datos no figuran en la captura original. La ilustración comparativa posterior no constituye una validación de esos componentes para el montaje de Cueva.

Los dos cables SPK+/SPK− van exclusivamente al parlante. No se convierte SPK− en GND. Los nombres de red comunes solo unen los terminales expresamente declarados; no se inventa el interior del ESP32, OLED o amplificador.

## Autoría declarativa sin coordenadas

El contrato `circuitkit.diagram.v1` separa los datos (módulos, puertos, conexiones) de su proyección visual. El compilador calcula las redes y genera las tres vistas. La CLI, el adaptador Markdown y la pantalla `/markdown` seleccionan `blocks`, `wiring` o `schematic` sin modificar el modelo de origen. No se ha añadido un selector universal a todas las pantallas educativas.

El primer layout basado en paneles repetidos no cumplió el resultado visual aprobado y fue reemplazado. Ahora cada módulo aparece una sola vez en una escena conectada: buses funcionales en bloques, cables entre pines en conexión y símbolos de alimentación/tierra más señales en el esquemático. La referencia de Cueva fija esta gramática visual; las coordenadas se calculan por el grafo, las métricas del texto y tipos de módulo declarados, no por nombres de placas. La entrada sigue sin aceptar coordenadas ni detalles de dibujo. Guía: [lenguaje de diagramas](diagram-language.md); ejemplo distribuible: `examples/diagrams/cueva.json`. Las comprobaciones de conectividad declarada no equivalen a certificación eléctrica.

## Evidencia local

Los artefactos y verificaciones de esta demostración viven en `artifacts/cueva-three-views/`, fuera del paquete distribuible. El código fuente del generador es reproducible y conserva la fuente previa sin sobrescribirla.

La igualdad de conectividad declarada no certifica el montaje: todavía harían falta referencias exactas de placas, comportamiento USB/VIN, niveles lógicos, configuración de GPIO, requisitos de alimentación y comprobaciones físicas. Ninguna de estas tres vistas se presenta como archivo de fabricación.
