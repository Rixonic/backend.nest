export type Department = 'laboratorio' | 'farmacia' | 'sistemas';

/**
 * Estado runtime de un sensor de temperatura, mantenido en memoria por el
 * monitor (equivalente al `flow.get('sensors')` de Node-RED). Combina la
 * configuración traída de la BD con los valores vivos de lectura/alerta.
 */
export interface SensorState {
  // --- Configuración (desde la BD) ---
  id: number;
  sensorId: string;
  name: string;
  labId: string;
  location: string;
  type: string;
  max: number;
  min: number;
  /** Debounce configurado, en segundos (ticks de `monitorTick`). */
  time: number;
  offset: number;
  source: 'modbus' | 'mqtt';

  // --- Runtime ---
  temp: number | null;
  alert: boolean;
  /** Cuenta regresiva de debounce restante mientras está fuera de rango. */
  debounce: number;
  /** Ticks restantes antes de considerar el sensor MQTT desconectado. */
  disconnectTicks: number;
}
