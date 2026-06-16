import { Logger } from '@nestjs/common';
import {
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

/**
 * Gateway WebSocket que difunde el estado en tiempo real a los clientes (front).
 * Reemplaza los nodos "websocket out" de Node-RED. Eventos emitidos:
 *  - `temperature`: snapshot de sensores de temperatura por departamento
 *  - `transfer`: estado decodificado de los PLC de transferencia
 *  - `water`: niveles de tanque/cisterna
 *  - `pressure`: presiones de oxígeno (ambos sensores juntos)
 *
 * Nota: usa socket.io; el frontend debe conectarse con un cliente soc.io.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class AlertGateway implements OnGatewayInit {
  private readonly logger = new Logger(AlertGateway.name);
  @WebSocketServer() private server!: Server;

  afterInit(): void {
    this.logger.log('Gateway WebSocket inicializado');
  }

  broadcast(
    event: 'temperature' | 'transfer' | 'water' | 'pressure',
    payload: unknown,
  ): void {
    this.server?.emit(event, payload);
  }
}
