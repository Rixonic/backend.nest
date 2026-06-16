/**
 * Convierte un par de registros Modbus (16 bits c/u, big-endian) en un float
 * IEEE-754 de 32 bits. Misma lógica que los nodos "Process/Temp" de Node-RED:
 *   registers[0] = palabra alta, registers[1] = palabra baja.
 */
export function registersToFloat(registers: number[]): number {
  const value = (registers[0] << 16) + registers[1];
  return Buffer.from([
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ]).readFloatBE(0);
}

/**
 * Convierte dos registros (decimales, valor) en un nivel escalado, igual que las
 * funciones de tanque/cisterna: `value = raw / 10^decimals`.
 */
export function registersToScaled(registers: number[]): number {
  const decimals = registers[0];
  const raw = registers[1];
  return raw / Math.pow(10, decimals);
}

/**
 * Expande un arreglo de registros de 16 bits a un arreglo de bits booleanos,
 * MSB primero (X15..X0 por registro), tal como espera el decodificador de los
 * PLC de transferencia de Castelar.
 */
export function registersToBits(registers: number[]): boolean[] {
  const bits: boolean[] = [];
  for (const reg of registers) {
    const binary = reg.toString(2).padStart(16, '0');
    for (const ch of binary) bits.push(ch === '1');
  }
  return bits;
}
