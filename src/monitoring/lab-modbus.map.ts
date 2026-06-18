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

/**
 * Puente Modbus→otro departamento: sensores cableados al MISMO PLC de
 * temperaturas pero cuyo estado vive en otro departamento. Hoy: el sensor de
 * farmacia "FCIA QX 1" (`ESP-f0f0f0`) está en la dirección 38 del PLC (el hueco
 * que deja el mapa del laboratorio), pero pertenece a farmacia.
 *
 * Su valor se inyecta en el estado del departamento por el mismo camino que las
 * lecturas MQTT, así cuando farmacia migre a un ESP real publicando `ESP-f0f0f0`
 * alcanza con borrar la entrada de acá: el `sensorId` ya coincide y la
 * suscripción MQTT toma el mismo estado sin más cambios.
 */
export const TEMP_MODBUS_BRIDGE: {
  address: number;
  /** Departamento destino (de los que reciben lecturas por el camino MQTT). */
  source: 'farmacia' | 'sistemas';
  sensorId: string;
}[] = [{ address: 38, source: 'farmacia', sensorId: 'ESP-f0f0f0' }];
