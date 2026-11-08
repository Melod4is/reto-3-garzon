# Proceso de órdenes de compra (OC)

Cada compra llega por correo con tres piezas: la solicitud (Excel), la cotización del proveedor y el correo de aprobación del líder. A veces llega también la factura. El agente prepara la OC; la analista confirma excepciones; SAP registra.

## Reglas de control

| Código | Qué verifica | Efecto |
|---|---|---|
| RC1 | El proveedor existe en el maestro (por NIT, o por nombre si no hay NIT) y está activo | Bloqueo |
| RC2 | Hay correo de aprobación, dice "Aprobado" y lo envía un aprobador del centro de costo | Bloqueo |
| RC3 | El valor total no supera el tope del aprobador en ese centro | Bloqueo |
| RC4 | La subárea pertenece al centro de costo | Bloqueo |
| RC5 | La cotización no difiere más de 2 % de la solicitud (o no hay cotización) | Confirmación |
| RC6 | Falta el indicador de IVA: se propone el del proveedor | Confirmación |
| RC7 | Faltan condiciones de pago: se toman del proveedor | Solo se informa |
| RC8 | La factura es anterior a la solicitud: OC retroactiva | Confirmación |
| RC9 | La aprobación es anterior a la solicitud | Confirmación |
| RC10 | Cantidad × valor unitario = valor total (±1) | Bloqueo |

## Qué pedir según el problema

- **Proveedor inexistente o inactivo (RC1):** compras debe crear o reactivar el proveedor en SAP (RUT y certificación bancaria), o el solicitante debe confirmar el NIT.
- **Aprobador sin autoridad (RC2/RC3):** pedir la aprobación a un aprobador del centro con tope suficiente. Si ninguno lo tiene, escalar a la dirección financiera.
- **Subárea o centro incorrecto (RC4) y totales que no cuadran (RC10):** el solicitante corrige el Excel.
- **Cotización distinta (RC5):** la OC se crea por el valor de la solicitud aprobada; si la diferencia es real, el solicitante debe pedir una nueva aprobación por el valor de la cotización.

## OC retroactivas

Una OC es retroactiva cuando la factura llegó antes de la solicitud: la compra ocurrió sin OC previa y, normalmente, sin comparar cotizaciones. No se rechaza automáticamente (la política aún no está definida), pero se crea solo con confirmación y queda marcada `retroactiva = true` en `out/control.csv` para que auditoría mida el desvío.

## Datos de la OC en SAP

- Sociedad y organización de compras: `1000`.
- Descripción de posición: máximo 40 caracteres (texto breve de SAP).
- Unidades: `UN` (unidades, licencias, bienes), `H` (horas de servicio), `MES` (mensualidades).
- Cada OC lleva el sha256 de la evidencia de aprobación y la lista de excepciones confirmadas.
- Crear dos veces la misma solicitud devuelve la misma OC (idempotencia).
