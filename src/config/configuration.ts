/**
 * Configuración centralizada y tipada del backend.
 *
 * Todos los intervalos de tiempo, endpoints de dispositivos (Modbus/MQTT) y
 * credenciales de canales de notificación se resuelven acá desde `process.env`
 * (cargado por `@nestjs/config`). Los valores que NO son secretos tienen
 * defaults razonables para poder correr en desarrollo sin un `.env` completo.
 *
 * Para cambiar una cadencia de polling, modificá la variable de entorno
 * correspondiente (o el default acá) — no hay intervalos hardcodeados en los
 * servicios.
 */

const int = (v: string | undefined, def: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : def;
};

const bool = (v: string | undefined, def: boolean): boolean => {
  if (v === undefined || v === '') return def;
  return v === 'true' || v === '1';
};

const str = (v: string | undefined, def: string): string =>
  v !== undefined && v !== '' ? v : def;

export interface ModbusDeviceConfig {
  name: string;
  host: string;
  port: number;
  unitId: number;
}

export interface AppConfig {
  /** Todos los intervalos en milisegundos, salvo donde se indique. */
  intervals: {
    plcTransferPoll: number;
    tempModbusPoll: number;
    monitorTick: number;
    readingsPersist: number;
    /** Muestreo de nivel de agua por Modbus + emisión WebSocket (ms). */
    waterPoll: number;
    /** Persistencia de nivel de agua en `agua.tanque`/`agua.cisterna` (ms). */
    waterPersist: number;
    /** Muestreo de presión de oxígeno por Modbus (ms). */
    oxygenPoll: number;
    /** Persistencia de presión de oxígeno en `oxigeno.historic` (ms). */
    oxygenPersist: number;
    /** Recarga de la config de sensores (max/min/time/offset) desde la BD. */
    sensorReload: number;
    /** Ticks de `monitorTick` sin lectura MQTT antes de marcar el sensor como desconectado. */
    mqttDisconnectTicks: number;
  };
  escalation: {
    /** Reenvío de alerta no reconocida (ms). */
    resendInterval: number;
    /** Extensión del timer tras un "Recibido" (ms). */
    ackExtendInterval: number;
  };
  modbus: {
    ramos: ModbusDeviceConfig;
    temp: ModbusDeviceConfig;
    castelar: ModbusDeviceConfig;
    tanque: ModbusDeviceConfig;
    cisterna: ModbusDeviceConfig;
    oxigeno: ModbusDeviceConfig;
  };
  mqtt: {
    url: string;
    topics: {
      farmacia: string;
      sistemas: string;
    };
  };
  channels: {
    telegram: { token: string };
    whatsapp: { token: string; phoneId: string; defaultTo: string };
    smtp: {
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
      from: string;
    };
    /** Chat de Telegram y destino WhatsApp para alarmas de transferencia/agua por sitio. */
    sites: {
      ramos: { telegramChatId: number; whatsappTo: string };
      castelar: { telegramChatId: number; whatsappTo: string };
    };
  };
  database: {
    sensors: {
      host: string;
      port: number;
      username: string;
      password: string;
      database: string;
    };
    plc: {
      host: string;
      port: number;
      username: string;
      password: string;
      database: string;
      schema: string;
    };
  };
  flags: {
    acquisitionEnabled: boolean;
    alertsEnabled: boolean;
  };
}

export default (): AppConfig => ({
  intervals: {
    plcTransferPoll: int(process.env.INT_PLC_TRANSFER_POLL, 2000),
    tempModbusPoll: int(process.env.INT_TEMP_MODBUS_POLL, 1000),
    monitorTick: int(process.env.INT_MONITOR_TICK, 1000),
    readingsPersist: int(process.env.INT_READINGS_PERSIST, 300_000),
    waterPoll: int(process.env.INT_WATER_POLL, 1000),
    waterPersist: int(process.env.INT_WATER_PERSIST, 60_000),
    oxygenPoll: int(process.env.INT_OXYGEN_POLL, 1000),
    oxygenPersist: int(process.env.INT_OXYGEN_PERSIST, 300_000),
    sensorReload: int(process.env.INT_SENSOR_RELOAD, 60_000),
    mqttDisconnectTicks: int(process.env.INT_MQTT_DISCONNECT_TICKS, 10),
  },
  escalation: {
    resendInterval: int(process.env.ESC_RESEND_INTERVAL, 1_200_000),
    ackExtendInterval: int(process.env.ESC_ACK_EXTEND_INTERVAL, 1_800_000),
  },
  modbus: {
    ramos: {
      name: 'ramos',
      host: str(process.env.PLC_RAMOS_HOST, '192.168.90.231'),
      port: int(process.env.PLC_RAMOS_PORT, 502),
      unitId: int(process.env.PLC_RAMOS_UNIT, 1),
    },
    temp: {
      name: 'temp',
      host: str(process.env.PLC_TEMP_HOST, '192.168.90.235'),
      port: int(process.env.PLC_TEMP_PORT, 502),
      unitId: int(process.env.PLC_TEMP_UNIT, 1),
    },
    castelar: {
      name: 'castelar',
      host: str(process.env.PLC_CASTELAR_HOST, '192.168.100.252'),
      port: int(process.env.PLC_CASTELAR_PORT, 8899),
      unitId: int(process.env.PLC_CASTELAR_UNIT, 1),
    },
    tanque: {
      name: 'tanque',
      host: str(process.env.TANQUE_HOST, '192.168.90.251'),
      port: int(process.env.TANQUE_PORT, 8899),
      unitId: int(process.env.TANQUE_UNIT, 1),
    },
    cisterna: {
      name: 'cisterna',
      host: str(process.env.CISTERNA_HOST, '192.168.90.249'),
      port: int(process.env.CISTERNA_PORT, 8899),
      unitId: int(process.env.CISTERNA_UNIT, 1),
    },
    oxigeno: {
      name: 'oxigeno',
      host: str(process.env.OXIGENO_HOST, '192.168.100.32'),
      port: int(process.env.OXIGENO_PORT, 502),
      unitId: int(process.env.OXIGENO_UNIT, 1),
    },
  },
  mqtt: {
    url: str(process.env.MQTT_URL, 'mqtt://localhost:8080'),
    topics: {
      farmacia: str(process.env.MQTT_TOPIC_FARMACIA, '/sensor/temperatura/#'),
      sistemas: str(process.env.MQTT_TOPIC_SISTEMAS, '/sistemas/temperatura/#'),
    },
  },
  channels: {
    telegram: { token: str(process.env.TELEGRAM_BOT_TOKEN, '') },
    whatsapp: {
      token: str(process.env.WHATSAPP_TOKEN, ''),
      phoneId: str(process.env.WHATSAPP_PHONE_NUMBER_ID, '602806129580480'),
      defaultTo: str(process.env.WHATSAPP_DEFAULT_TO, '1156166285'),
    },
    smtp: {
      host: str(process.env.SMTP_HOST, 'smtp.office365.com'),
      port: int(process.env.SMTP_PORT, 587),
      secure: bool(process.env.SMTP_SECURE, false),
      user: str(process.env.SMTP_USER, ''),
      pass: str(process.env.SMTP_PASS, ''),
      from: str(
        process.env.SMTP_FROM,
        'CRM Ingenieria <crm.ingenieria@sanjuandedios.org.ar>',
      ),
    },
    sites: {
      ramos: {
        telegramChatId: int(process.env.TELEGRAM_CHAT_RAMOS, -4086643597),
        whatsappTo: str(process.env.WHATSAPP_TO_RAMOS, '1156166285'),
      },
      castelar: {
        telegramChatId: int(process.env.TELEGRAM_CHAT_CASTELAR, -4949079047),
        whatsappTo: str(process.env.WHATSAPP_TO_CASTELAR, '1156166285'),
      },
    },
  },
  database: {
    sensors: {
      host: str(process.env.DB_SENSORS_HOST, '192.168.90.219'),
      port: int(process.env.DB_SENSORS_PORT, 5432),
      username: str(process.env.DB_SENSORS_USER, 'postgres'),
      password: str(process.env.DB_SENSORS_PASS, 'toor'),
      database: str(process.env.DB_SENSORS_NAME, 'dbSensors'),
    },
    plc: {
      host: str(process.env.DB_PLC_HOST, '192.168.90.200\\SQLEXPRESS'),
      port: int(process.env.DB_PLC_PORT, 1433),
      username: str(process.env.DB_PLC_USER, 'guest'),
      password: str(process.env.DB_PLC_PASS, '1234'),
      database: str(process.env.DB_PLC_NAME, 'E3_HSJD'),
      schema: str(process.env.DB_PLC_SCHEMA, 'dbo'),
    },
  },
  flags: {
    acquisitionEnabled: bool(process.env.ACQUISITION_ENABLED, true),
    alertsEnabled: bool(process.env.ALERTS_ENABLED, true),
  },
});
