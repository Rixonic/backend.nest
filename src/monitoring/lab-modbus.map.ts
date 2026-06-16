/**
 * Mapa `sensorId -> dirección Modbus` del laboratorio (PLC de temperaturas,
 * función FC3 / holding registers). Cada sensor ocupa 2 registros (float).
 * Extraído del nodo "Read Temp" del flujo "CT - Laboratorio".
 *
 * Sólo los sensores del laboratorio listados acá se leen por Modbus; el resto
 * de departamentos recibe sus lecturas por MQTT.
 */
export const LAB_MODBUS_ADDRESSES: Record<string, number> = {
  A_5_12: 0,
  A_5_58: 2,
  A_5_59: 4,
  A_5_13: 6,
  A_5_14: 8,
  A_5_19: 10,
  A_5_18: 12,
  A_5_10: 14,
  A_5_08: 16,
  A_5_07: 18,
  A_5_100: 20,
  A_5_09: 22,
  A_5_20: 24,
  A_5_54: 26,
  A_5_57: 28,
  A_5_46: 30,
  A_5_11: 32,
  A_5_106: 34,
  A_5_107: 36,
  A_5_101: 40,
  A_5_102: 42,
  A_5_103: 44,
  A_5_104: 46,
};
