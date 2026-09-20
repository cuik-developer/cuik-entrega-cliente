# Pruebas pendientes en produccion (19 set. 2026)

Cubre los despliegues `e3b3561` y `442a3ba` (programa de puntos, panel Premios, strip, reportes por correo y landing). Detalle tecnico en `Dev/APROBACION-PUNTOS.md` y `Dev/REVISION-PUNTOS.md`.

> Antes de empezar: en cada tenant de puntos, dejar **una sola promocion activa** (desactivar la de sellos por defecto). Con dos activas una visita puede registrarse como sello; el arreglo de fondo toca un archivo protegido y queda pendiente.

## 1. Puntos: acumulacion y canje

| # | Que hacer | Que debe pasar | Estado |
|---|---|---|---|
| 1 | Registrar un cliente desde la pagina publica con la casilla de marketing marcada | Nace con el bono configurado (p. ej. 10 pts) y en Actividad aparece una visita tipo bono | |
| 2 | Registrar otro cliente sin marcar la casilla | Nace con 0 pts | |
| 3 | Cliente con cumpleanos hoy y multiplicador x2, compra de S/ 20 | Recibe el doble (40 pts) | |
| 4 | Cajero: Canjear un premio, confirmar, y volver a canjear el mismo enseguida | El boton pide confirmacion; el segundo intento muestra "Este premio ya se canjeo hace un momento" | |
| 5 | Abrir el pase (Apple o Google) despues del canje | Muestra el saldo nuevo sin esperar otra visita | |
| 6 | Pase de Google de un programa de puntos | Dice "N puntos", no "N de M visitas" | |
| 7 | Super-admin: crear promocion de puntos con 2 pts/sol, minimo S/ 15, maximo 2/dia y reabrirla | Los valores se conservan | |
| 7b | Super-admin: editar la promocion de puntos, poner **Multiplicador de cumpleanos = 2** y guardar; luego repetir la prueba 3 | El campo existe (antes no) y la visita del cumpleanero suma el doble | |
| 7c | Super-admin: Registro → Bono de marketing en un tenant de puntos | Solo aparece el campo "Puntos bonus" (antes aparecian sellos y puntos y era facil cargar el equivocado) | |
| 6b | Reverso del pase de Google de un cliente registrado sin DNI | No aparece "ID de miembro" con el codigo `cuik:...`; con DNI muestra el DNI | |

## 2. Panel Premios (nuevo, solo programas de puntos)

| # | Que hacer | Que debe pasar | Estado |
|---|---|---|---|
| 8 | Entrar al panel del admin | Aparece **Premios** en el menu solo si el programa es de puntos | |
| 9 | Crear un premio con foto PNG o JPG (la foto se arrastra y se acerca con zoom directamente en el marco, sin boton de recorte; el encuadre se guarda al guardar el premio), editarlo, ocultarlo con el interruptor | La foto se ve en la tarjeta y en `tu-comercio/premios`; al ocultarlo desaparece de la pagina publica | |
| 10 | Botones Copiar, WhatsApp y Ver pagina del enlace publico | Copian/abren la URL `tu-comercio/premios` | |

## 3. Strip del pase de puntos

| # | Que hacer | Que debe pasar | Estado |
|---|---|---|---|
| 11 | Subir el strip como **PNG de 750x246** en el diseno y hacer **Publicar** (no solo guardar); reinstalar el pase en un iPhone | La franja muestra la imagen de fondo (antes salia vacia) | |

## 4. Reportes por correo

| # | Que hacer | Que debe pasar | Estado |
|---|---|---|---|
| 12 | Confirmar el schedule `reports` en Dokploy (`10 * * * *`, POST `https://cuik.org/api/cron/reports`) | Queda creado y activo | |
| 13 | Con el reporte semanal activado en Analitica, esperar al lunes | Llega el correo con el Excel: encabezados azul Cuik, sin hoja de cumpleanos si esta vacia | |
| 14 | Agregar un segundo destinatario en la tarjeta de reportes y usar "Enviarme una prueba" | Ambos correos reciben la prueba | |

## 5. Landing (repaso rapido en movil)

| # | Que hacer | Que debe pasar | Estado |
|---|---|---|---|
| 15 | Hero: tocar los telefonos del fondo | Pasan al frente | |
| 16 | Secciones "El antes y el ahora" y "4 formas de fidelizar" | Animaciones fluidas; el boton de pausa detiene la de 4 formas | |
| 17 | Footer | Instagram y WhatsApp abren; TikTok y LinkedIn no aparecen | |

## Como reportar

Anotar en la columna Estado: OK, FALLA (con captura y que paso) o NO PROBADO.
