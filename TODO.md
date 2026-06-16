# TODO

## Crítico

- [x] **Credenciales a variables de entorno** — IPs, usuarios y contraseñas movidos a `.env` con `@nestjs/config` (`src/config/configuration.ts`)
- [ ] **Validación de DTOs** — agregar `class-validator` a todos los DTOs y activar `ValidationPipe` global en `main.ts`
- [ ] **Restringir CORS** — reemplazar `origin: '*'` por los orígenes reales del frontend

## Importante

- [ ] **ExceptionFilter global** — manejar errores de TypeORM y excepciones no controladas con respuestas coherentes
- [ ] **Migraciones TypeORM** — crear carpeta `src/migrations/` y configurar TypeORM CLI para gestionar cambios de esquema
- [ ] **Tests** — agregar `*.spec.ts` para los servicios con lógica de transformación de datos (splits de arrays temp/timestamp)

## Menor

- [ ] **Puerto a `.env`** — sacar `4125` hardcodeado de `main.ts`
- [ ] **Actualizar README.md** — corregir referencias a MySQL y `npm install` (el proyecto usa PostgreSQL + MSSQL y Yarn 4)
- [ ] **Resiliencia en PdfModule** — agregar reconexión lazy o healthcheck al browser de Puppeteer para recuperarse si el proceso cae

## Eficiencia de runtime

- [ ] **Caché en queries de lecturas** — usar `@nestjs/cache-manager` con TTL de 30-60s en endpoints de sensores para reducir tráfico repetido a PostgreSQL
- [ ] **Índices en tabla `historic`** — agregar índice compuesto `(sensor_id, timestamp)` en cada schema para evitar full scans en queries por rango de fechas
- [ ] **Paginación** — agregar `take`/`skip` con filtro de fecha en los endpoints que devuelven lecturas históricas
- [ ] **Cola de PDFs** — usar `p-queue` o similar para limitar concurrencia de páginas Puppeteer y evitar que requests simultáneos se bloqueen entre sí

## Arquitectura

- [ ] **Base service genérico** — crear `BaseSensorService<T, R>` para eliminar la lógica CRUD duplicada entre NurseryService, FarmacyService, LaboratoryService y SystemService
- [x] **Alertas por eventos** — la integración de Node-RED al backend agrega adquisición Modbus/MQTT, evaluación de umbrales con debounce, escalado de alertas (Telegram/WhatsApp/Email) y difusión por WebSocket (`AlertGateway`). Ver `src/monitoring`, `src/notifications`, `src/electrical`, `src/water`
- [ ] **DatabaseModule** — encapsular las dos conexiones TypeORM en un módulo propio para centralizar configuración de pool, retry y SSL
