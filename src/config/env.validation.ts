import * as Joi from 'joi';

/**
 * Validación de variables de entorno.
 *
 * Casi todo es opcional: `configuration.ts` provee defaults para los valores no
 * secretos, y los secretos (tokens/credenciales) pueden faltar en desarrollo
 * (los canales simplemente quedan deshabilitados). Lo único que validamos
 * estrictamente es que, si una variable está presente, tenga el tipo correcto,
 * para fallar temprano ante un `.env` mal escrito.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  // Intervalos (ms)
  INT_PLC_TRANSFER_POLL: Joi.number().positive().optional(),
  INT_TEMP_MODBUS_POLL: Joi.number().positive().optional(),
  INT_MONITOR_TICK: Joi.number().positive().optional(),
  INT_READINGS_PERSIST: Joi.number().positive().optional(),
  INT_WATER_POLL: Joi.number().positive().optional(),
  INT_WATER_PERSIST: Joi.number().positive().optional(),
  INT_OXYGEN_POLL: Joi.number().positive().optional(),
  INT_OXYGEN_PERSIST: Joi.number().positive().optional(),
  INT_MQTT_DISCONNECT_TICKS: Joi.number().positive().optional(),
  ESC_RESEND_INTERVAL: Joi.number().positive().optional(),
  ESC_ACK_EXTEND_INTERVAL: Joi.number().positive().optional(),

  // Dispositivos Modbus
  PLC_RAMOS_HOST: Joi.string().optional(),
  PLC_RAMOS_PORT: Joi.number().port().optional(),
  PLC_TEMP_HOST: Joi.string().optional(),
  PLC_TEMP_PORT: Joi.number().port().optional(),
  PLC_CASTELAR_HOST: Joi.string().optional(),
  PLC_CASTELAR_PORT: Joi.number().port().optional(),
  TANQUE_HOST: Joi.string().optional(),
  TANQUE_PORT: Joi.number().port().optional(),
  CISTERNA_HOST: Joi.string().optional(),
  CISTERNA_PORT: Joi.number().port().optional(),
  OXIGENO_HOST: Joi.string().optional(),
  OXIGENO_PORT: Joi.number().port().optional(),

  // MQTT
  MQTT_URL: Joi.string().optional(),

  // Canales (secretos: opcionales)
  TELEGRAM_BOT_TOKEN: Joi.string().allow('').optional(),
  WHATSAPP_TOKEN: Joi.string().allow('').optional(),
  WHATSAPP_PHONE_NUMBER_ID: Joi.string().allow('').optional(),
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().port().optional(),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASS: Joi.string().allow('').optional(),

  // Flags
  ACQUISITION_ENABLED: Joi.boolean().truthy('1').falsy('0').optional(),
  ALERTS_ENABLED: Joi.boolean().truthy('1').falsy('0').optional(),
}).unknown(true);
