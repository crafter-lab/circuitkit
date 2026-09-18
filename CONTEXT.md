# Figuras electrónicas educativas

Una misma idea electrónica puede representarse con distintas vistas. El tipo de diagrama describe su propósito y detalle, no garantiza su corrección ni su fidelidad física.

## Language

**Tipo de diagrama**:
Convención de representación: bloques, conexión, esquemático o disposición física simplificada. No equivale al contenido mostrado ni a una etapa de enseñanza.
_Avoid_: Nivel de calidad, nivel de validación

**Diagrama de bloques**:
Vista funcional de módulos y sus relaciones. Puede agrupar alimentación y buses sin identificar todos los conductores o pines.
_Avoid_: Esquemático eléctrico completo

**Diagrama de conexión**:
Mapa de los cables entre terminales identificados. Indica qué conectar con qué, pero no implica posiciones físicas verificadas ni describe los circuitos internos de los módulos.
_Avoid_: Pinout físico, diseño de PCB

**Diagrama esquemático**:
Representación de conectividad eléctrica mediante símbolos, terminales y redes. Su alcance puede ser de componentes individuales o de módulos tratados como cajas negras.
_Avoid_: Circuito certificado, archivo de fabricación

**Esquemático modular**:
Esquemático cuyas cajas representan placas o módulos, sin afirmar el conocimiento de su circuito interno. Los terminales pueden llevar nombres de la fuente sin corresponder a números de encapsulado.
_Avoid_: Esquemático completo a nivel de chip

**Disposición física simplificada**:
Vista educativa de ubicaciones y contactos de una placa o protoboard. No supone escala, footprints o dimensiones aptas para fabricar.
_Avoid_: CAD, layout de PCB

**Nivel de abstracción**:
Detalle representado: funciones, terminales entre módulos, componentes o colocación simplificada. Mayor detalle no significa mayor confianza.
_Avoid_: Precisión garantizada

**Alcance de validación**:
Conjunto de propiedades realmente comprobadas, como legibilidad, correspondencia con una fuente o equivalencia de conectividad declarada. No incluye funcionamiento eléctrico o fabricación salvo evidencia específica.
_Avoid_: Validado sin especificar qué se comprobó

**Fidelidad física**:
Correspondencia demostrada entre el dibujo y el montaje real, incluidos posiciones, dimensiones y referencias de placa. Puede ser desconocida aunque la conectividad dibujada sea coherente.
_Avoid_: Realista como sinónimo de correcto

**Red eléctrica**:
Conjunto de terminales declarados como conectados mediante conductores. La proximidad visual y el color de una línea no crean una conexión.
_Avoid_: Cable individual, bloque funcional

**Descripción del sistema**:
Conjunto de módulos, puertos y conexiones declarados, independiente de la disposición visual. Puede tener varias vistas sin cambiar su conectividad.
_Avoid_: Dibujo como fuente de conectividad

**Módulo**:
Unidad funcional con identidad y puertos nombrados. Puede representar una placa o un dispositivo sin afirmar el conocimiento de su circuito interno.
_Avoid_: Encapsulado físico implícito

**Puerto**:
Interfaz nombrada de un módulo a la que puede declararse una conexión. Su identidad no implica un número ni una posición física de pin.
_Avoid_: Coordenada, agujero de protoboard

**Conexión**:
Relación conductora declarada entre dos puertos distintos. Su orden de escritura no determina el sentido de corriente o de datos.
_Avoid_: Flecha como simulación

**Bus**:
Agrupación funcional nombrada de señales relacionadas. Compartir un bus no une eléctricamente señales distintas.
_Avoid_: Red eléctrica

**Vista**:
Representación de una misma descripción del sistema bajo una convención de diagrama. Cambiar de vista no cambia las conexiones declaradas ni su grado de validación.
_Avoid_: Nueva versión del circuito

**Tipo de módulo**:
Función declarada de una unidad, como controlador, pantalla, amplificador, parlante o conector. No identifica su encapsulado, posición física ni circuito interno.
_Avoid_: Tipo de diagrama, preset de coordenadas

**Sentido funcional**:
Dirección declarada de una relación de datos o alimentación. Puede orientar una flecha de bloques sin afirmar una simulación de corriente ni cambiar la conectividad eléctrica.
_Avoid_: Corriente calculada
