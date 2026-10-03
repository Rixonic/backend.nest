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

## Working rules

- **Plan first, delegate code to Sonnet agents.** For implementation work, the main session plans (reads the relevant code, decides the design, splits the work), and the code itself is written by subagents launched with `model: "sonnet"`. Give each agent a self-contained brief (files to create/edit, patterns to copy, acceptance criteria). The main session then reviews the result, runs `yarn build` / `yarn test`, and fixes or re-delegates as needed.

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
| `PLCModule` | `/plc` | PLC alarm queries (MSSQL); `GET /plc/alarms?limit=&since=` (limit default 200, max 1000; since ISO, filters e3TimeStamp >=) |
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
| `Co2MonitorModule` | [src/co2-monitor/](src/co2-monitor/) | `Co2MonitorService`: CO2 pressure (Ramos Mejía, two cylinder batteries, bar; full cylinder ~50–55). Reads an Arduino Modbus TCP server at `192.168.90.31:502` (unit 1, device `co2`) with **one** FC4 request for input registers 0..10 (fragile device — never register by register): 0/1 = value ch1/ch2 (bar×100), 6 = ADS status (1 OK), 7/8 = current ch1/ch2 (mA×100), 9/10 = loop state ch1/ch2 (0 OK, 1 open loop < 3.6 mA, 2 short > 21 mA); regs 2–5 (mV/raw) are unused. A channel is valid **only if reg 6 = 1 and its loop state = 0**, else `pressure = null` with status `adc-error`/`open-loop`/`over-range` (`no-data` before the first read; transitions are logged, not every tick). `pressure = raw/100 − offset`, broadcast on the `co2` WS event every `co2Poll` (1s) as `{sensorId,name,pressure,current,status}[]`, persisted (valid readings only) to `co2.historic` every `co2Persist` (5min). Low-pressure alert < 8 bar, re-armed > 15 bar (cylinder replaced), evaluated on valid readings only. There are no recipients yet: the falling edge is logged and, if `CO2_ALERT_WEBHOOK_URL` (`co2.alertWebhookUrl`) is set and `ALERTS_ENABLED`, POSTs JSON `{type:'co2-low-pressure',site:'ramos',sensorId,name,pressure,threshold:8,timestamp}` (5 s timeout, errors logged) to it — meant for an external WhatsApp-group app. No Telegram/WhatsApp service. Sensor config lives in `co2.sensors`; rows map to channels by ascending id (max 2). Persistence layer + `/co2` endpoints (`GET /co2/sensors`, `/co2/:sensorId/last`, `/co2/:sensorId/interval?start&end`) are in [src/services/co2/](src/services/co2/) (`Co2Module`) |
| `LiquidMonitorModule` | [src/liquid/](src/liquid/) | `LiquidMonitorService`: liquid-oxygen tank level (kg) read **by camera, without AI**. Every `liquidCapture` (15min) it grabs a JPEG from the Hikvision camera via ISAPI (`/ISAPI/Streaming/channels/101/picture`, HTTP Digest — [hikvision-snapshot.ts](src/liquid/hikvision-snapshot.ts)) and decodes the top line of the Linde Hawkeye 7-segment LCD ([lcd-reader.ts](src/liquid/lcd-reader.ts), pure-JS pixel math over `jpeg-js`). Up to 3 shots; persists to `oxigeno.liquid` (`timestamp` PK, `measure` integer) only when two agree, and broadcasts on the `liquid` WS event. No alerts. Doubtful readings are discarded, never guessed. Every captured photo is archived to `LIQUID_SNAPSHOT_DIR` (default `snapshots/liquid`, relative to cwd, gitignored) named `<local-datetime>_<attempt>_<value|fail>.jpg`, pruned after `LIQUID_SNAPSHOT_KEEP_DAYS` (7; `0` disables) — use them to recalibrate the reader. `GET /oxigeno/liquid/image` serves the last snapshot (to check framing); history at `/oxigeno/liquid/last` and `/oxigeno/liquid/interval` |
| `FuelMonitorModule` | [src/fuel/](src/fuel/) | `FuelMonitorService`: fuel level (%) of generators G2 (`192.168.90.115:8899`) and G3 (`192.168.90.116:8899`), Famil L-510 gauges behind Elfin EE11 gateways in TCP-SERVER mode. **Not Modbus**: the device pushes ASCII `NN
` (fill %, 0..100) every ~300 ms; the service just opens a TCP socket, buffers and splits lines (`parseFuelLine`; anything invalid is counted and ignored). Serial is **9600 baud** (the vendor manual says 4800 — wrong). Broadcasts on the `fuel` WS event `{id,name,level,status,updatedAt}[]` (`status` = `ok`/`offline`/`no-data`) immediately on level/status change and every `fuelBroadcast` (5s). Watchdog: no valid frame for `fuelStale` (10s) → `offline` (last level kept; never-seen device → `offline` with `level null`) and the socket is destroyed to force a reconnect (clears phantom EE11 sessions); reconnect 5 s after close. Devices in `fuel.devices` (`FUEL_G2_*`/`FUEL_G3_*`). **No persistence and no alerts by design** (level can stay unchanged for months); no HTTP controller (only in `/monitor/snapshot`) |
| `MonitorModule` | [src/monitor/](src/monitor/) | `GET /monitor/snapshot` — aggregates the in-memory live state of all monitors (temperature/transfer/water/oxygen/liquid/co2/fuel) in one response, for the front's first render (SSR) without waiting for the first WebSocket tick |

**LCD reader calibration:** segment positions are fixed pixel coordinates for the current camera framing (constants at the top of [lcd-reader.ts](src/liquid/lcd-reader.ts)). Camera drift (±50 px) and motorized-zoom changes (0.9–1.15×) are absorbed by registering against the LCD window: its four edges (bezel→glass brightness step) are found as opposite pairs constrained to a plausible width/height, and calibrated segment positions are mapped with the resulting shift + scale — **not** by searching the shift that decodes best, which yields valid-but-wrong numbers when misaligned by 3–4 px. Moves larger than the ±50 px search are handled by `FRAMINGS` (coarse offsets of the whole image, tried in order; the calibration constants stay in the original framing's coordinates) — on 2026-10-03 the camera was bumped during a refill and the LCD moved (-219, -94), so a second framing was added. The window's tilt (~0.9°, measured sub-pixel on the top edge) is applied to the segment positions, and the upper flank of segment `a` is kept off the frame (`FRAME_MARGIN`): otherwise an off `a` reads as on in the right-hand digits and a 4 becomes a valid-but-wrong 9. If the camera is moved/zoomed, add a `FRAMINGS` entry (or recalibrate from a new snapshot) and add it as a fixture in [src/liquid/\_\_fixtures\_\_/](src/liquid/__fixtures__/) (tests in `lcd-reader.spec.ts`). **Do not use `sharp` (or other native image libs) here:** its prebuilt linux-x64 binaries require an x86-64-v2 CPU and the production server lacks it (`Unsupported CPU` at startup). JPEG decoding uses pure-JS `jpeg-js` (~250 ms per 2560x1440 frame, fine for one capture every 15 min).

In-memory runtime state (sensor temps, alert flags, debounce/escalation timers, previous PLC bitfield) replaces Node-RED's `flow context`. Sensor config (max/min/time/offset) is loaded from the DB on bootstrap and refreshed via `TemperatureMonitorService.reloadSensors` **instantly** when a sensor is edited through `PUT /{dep}/sensor/update` (the department service emits `config-changed` on the global `SensorEventBus` in [src/events/](src/events/), which the monitor subscribes to — decoupled to avoid a circular dependency). There is no periodic reload: edits made directly in the DB (out of band) require a restart. Device endpoints, polling intervals and alert recipients are all config-driven (see Configuration below).

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

Runtime deps added for this layer: `@nestjs/config`, `@nestjs/schedule`, `@nestjs/websockets`, `@nestjs/platform-socket.io`, `modbus-serial`, `mqtt`, `nodemailer`, `node-telegram-bot-api`, `joi`, `jpeg-js`.

> Note: the original Node-RED flows are preserved in `flows.json` for reference. The backend is intended to fully replace them (single-facility cutover); run only one of the two to avoid duplicate readings/alerts.
