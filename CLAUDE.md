# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
yarn start:dev        # Watch mode with hot reload
yarn start:prod       # Run compiled dist/main.js

# Build & Quality
yarn build            # Compile TypeScript (runs prebuild first, which cleans dist/)
yarn lint             # ESLint with auto-fix
yarn format           # Prettier formatting

# Testing
yarn test             # Unit tests (Jest)
yarn test:watch       # Jest in watch mode
yarn test:cov         # Coverage report
yarn test:e2e         # E2E (not yet implemented)
```

Package manager is **Yarn 4** — do not use `npm`.

## Architecture Overview

This is a NestJS monitoring backend for a healthcare facility. It tracks temperature/environmental sensors across hospital departments and integrates with a PLC alarm system.

**Port:** 4125 — **CORS:** all origins allowed.

### Multi-database setup

Two TypeORM named connections are configured in [src/app.module.ts](src/app.module.ts):

| Name | Type | Host | Database | Usage |
|------|------|------|----------|-------|
| `sensors` | PostgreSQL | 192.168.90.219:5432 | dbSensors | All sensor entities and readings |
| `plc` | SQL Server | 192.168.90.200\SQLEXPRESS:1433 | E3_HSJD | PLC alarm data (read-only) |

Both connections use `synchronize: false` and `autoLoadEntities: false` — entities are registered manually, schema changes must be applied externally.

### Domain modules

Services are organized by hospital department under [src/services/](src/services/):

| Module | Controller prefix | Description |
|--------|-------------------|-------------|
| `NurseryModule` | `/enfermeria` | Nursing sensors |
| `FarmacyModule` | `/farmacia` | Pharmacy sensors |
| `LaboratoryModule` | `/laboratorio` | Laboratory sensors |
| `SystemModule` | `/sistemas` | Systems/infrastructure sensors |
| `WaterModule` | `/agua` | Water level tanks (tanque/cisterna) |
| `PLCModule` | `/plc` | PLC alarm queries (MSSQL) |
| `PdfModule` | `/pdf` | PDF/ZIP report generation |

### Data acquisition & alerting layer (migrated from Node-RED)

Originally a set of Node-RED flows (`flows.json`) handled all Modbus/MQTT acquisition and alerting. That logic now lives in the backend. These modules have **no HTTP controllers** — they run background pollers via `@nestjs/schedule` and broadcast over a WebSocket gateway:

| Module | Source dir | Responsibility |
|--------|-----------|----------------|
| `AcquisitionModule` (global) | [src/acquisition/](src/acquisition/) | `ModbusService` (pool of TCP clients, one per device, serialized + auto-reconnect) and `MqttService` (subscribes to temperature topics, emits `reading` events) |
| `MonitoringModule` | [src/monitoring/](src/monitoring/) | `TemperatureMonitorService`: holds per-sensor runtime state in memory, reads lab temps via Modbus and farmacia/sistemas via MQTT, applies offset + threshold + debounce, persists readings via the department `SensorReadingsService.createMany` |
| `NotificationsModule` | [src/notifications/](src/notifications/) | Channels `TelegramService` (ESM-only `node-telegram-bot-api`, loaded via dynamic `import()`), `WhatsappService` (Meta Graph API via `fetch`), `EmailService` (nodemailer/Office365), `AlertGateway` (socket.io); plus `EscalationService` (group/working-hours escalation state machine + Telegram ack/cancel callbacks) |
| `ElectricalModule` | [src/electrical/](src/electrical/) | `TransferMonitorService`: polls the Ramos Mejía + Castelar transfer PLCs, decodes the bitfield, edge-detects rising signals and notifies |
| `WaterMonitorModule` | [src/water/](src/water/) | `WaterMonitorService`: polls tank/cisterna level and broadcasts on the `water` WS event every `waterPoll` (1s), persists the last level to `agua.tanque`/`agua.cisterna` every `waterPersist` (1min), and alerts on low level. Poll/broadcast and persistence are decoupled (same pattern as `OxygenMonitorService`) |
| `OxygenMonitorModule` | [src/oxygen/](src/oxygen/) | `OxygenMonitorService`: polls two oxygen pressure sensors via Modbus input registers (FC4, addr 0/1 on `192.168.100.32:502`), `pressure = raw/100 − offset`, broadcasts both on the `pressure` WS event every `oxygenPoll` (1s), persists to `oxigeno.historic` every `oxygenPersist` (5min), and Telegram-alerts on low pressure (< 20, reset > 100). No WhatsApp. Sensor config (id/name/sensorId/offset) lives in the `oxigeno.sensors` table; rows map to Modbus addresses by ascending id. Persistence layer + `/oxigeno` history endpoints are in [src/services/oxigeno/](src/services/oxigeno/) (`OxygenModule`) |
| `MonitorModule` | [src/monitor/](src/monitor/) | `GET /monitor/snapshot` — aggregates the in-memory live state of all four monitors (temperature/transfer/water/oxygen) in one response, for the front's first render (SSR) without waiting for the first WebSocket tick |

In-memory runtime state (sensor temps, alert flags, debounce/escalation timers, previous PLC bitfield) replaces Node-RED's `flow context`. Sensor config (max/min/time/offset) is loaded from the DB on bootstrap and refreshed via `TemperatureMonitorService.reloadSensors` in two ways: **instantly** when a sensor is edited through `PUT /{dep}/sensor/update` (the department service emits `config-changed` on the global `SensorEventBus` in [src/events/](src/events/), which the monitor subscribes to — decoupled to avoid a circular dependency), and **periodically** (`INT_SENSOR_RELOAD`, default 60s) as a safety net for out-of-band DB edits. Device endpoints, polling intervals and alert recipients are all config-driven (see Configuration below).

**Adding dependencies note:** `node-telegram-bot-api` is **ESM-only** with bundled types — do not install `@types/node-telegram-bot-api`, and load it with the dynamic-`import()` helper in [telegram.service.ts](src/notifications/telegram.service.ts) (the project compiles to CommonJS, so a plain `require`/`import` would fail at runtime).

### Shared entity hierarchy

Sensor and reading entities use inheritance with table-per-schema:

- `Sensor` (abstract) → `NurserySensor`, `LaboratorySensor`, `FarmacySensor`, `SystemSensor`
  - Each maps to its department's PostgreSQL schema (`enfermeria`, `laboratorio`, `farmacia`, `sistemas`)
  - Source: [src/sensors/sensor.entity.ts](src/sensors/sensor.entity.ts)

- `SensorReading` (abstract) → per-department reading entities
  - Composite PK: `(timestamp, sensor_id)`; table name: `historic` in each schema
  - Source: [src/sensorReadings/sensorReading.entity.ts](src/sensorReadings/sensorReading.entity.ts)

- `WaterReading` (abstract) → `TankSensorReading`, `CisternaSensorReading`
  - Schema: `agua`, separate tables `tanque`/`cisterna`
  - Source: [src/agua/agua.entity.ts](src/agua/agua.entity.ts)

When injecting repositories in services, always pass the named connection string to `@InjectRepository(Entity, 'sensors')` or `@InjectRepository(Entity, 'plc')`.

### PDF service

[src/pdf/pdf.service.ts](src/pdf/pdf.service.ts) manages a Puppeteer browser lifecycle via `OnModuleInit`/`OnModuleDestroy`. It injects services from Nursery, Farmacy, and Laboratory modules to aggregate data, renders HTML templates from [src/pdf/templates/](src/pdf/templates/), and streams multi-page reports as ZIP archives.

### No auth/middleware layer

There are no guards, interceptors, filters, or custom decorators. All endpoints are publicly accessible.

## Configuration

Configuration uses **`@nestjs/config`** (global `ConfigModule`) with a typed factory in [src/config/configuration.ts](src/config/configuration.ts) and Joi validation in [src/config/env.validation.ts](src/config/env.validation.ts). The two TypeORM connections in [src/app.module.ts](src/app.module.ts) are built via `forRootAsync` from this config.

- **Secrets and device endpoints** live in `.env` (gitignored). Copy [.env.example](.env.example) to `.env` and fill in `TELEGRAM_BOT_TOKEN`, `SMTP_USER`/`SMTP_PASS`, etc. Every non-secret value has a sane default in `configuration.ts`, so the app boots without a complete `.env`.
- **Polling intervals** (`INT_*`, `ESC_*`), **Modbus device IPs/ports**, **MQTT URL/topics**, **DB credentials** and **notification credentials** are all environment variables — there are no hardcoded intervals or endpoints in the services.
- **Alert recipients** (Telegram chatIds, emails, escalation groups, working hours) are versioned in [src/config/recipients.config.ts](src/config/recipients.config.ts) — not in `.env`.
- **Feature flags**: `ACQUISITION_ENABLED` and `ALERTS_ENABLED` (default `true`) gate the background pollers and the notification channels respectively. Missing credentials disable individual channels gracefully (logged as warnings).

Runtime deps added for this layer: `@nestjs/config`, `@nestjs/schedule`, `@nestjs/websockets`, `@nestjs/platform-socket.io`, `modbus-serial`, `mqtt`, `nodemailer`, `node-telegram-bot-api`, `joi`.

> Note: the original Node-RED flows are preserved in `flows.json` for reference. The backend is intended to fully replace them (single-facility cutover); run only one of the two to avoid duplicate readings/alerts.
