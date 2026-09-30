import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type TelegramBot from 'node-telegram-bot-api';
import { AppConfig } from '../config/configuration';

/**
 * `node-telegram-bot-api` es ESM-only; el proyecto compila a CommonJS, así que
 * lo cargamos con un `import()` dinámico real. Envolverlo en `new Function`
 * evita que TypeScript lo transpile a `require()` (que fallaría con
 * ERR_PACKAGE_PATH_NOT_EXPORTED).
 */
const importEsm = new Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<{ default: typeof TelegramBot }>;

const POLLING_LOG_EVERY_MS = 5 * 60_000;

/** Recorre la cadena `cause` (FatalError → TypeError "fetch failed" → error de undici/red). */
function describeError(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    const e = current as { message?: string; code?: string; cause?: unknown };
    const text = [e.code, e.message].filter(Boolean).join(' ');
    if (text && !parts.some((p) => p.includes(text))) parts.push(text);
    current = e.cause;
  }
  return parts.join(' <- ') || String(err);
}

export interface AlertCallbackData {
  sensorId: string;
  received: boolean;
  canceled: boolean;
}

export type CallbackHandler = (
  data: AlertCallbackData,
  chatId: number | string,
) => void;

/** Subconjunto de `callback_query` que usamos (sin depender del namespace de tipos). */
interface CallbackQuery {
  id: string;
  data?: string;
  from: { id: number };
  message?: { chat: { id: number } };
}

/**
 * Cliente de Telegram: envía mensajes (con botones inline Recibido/Cancelar) y
 * escucha respuestas `callback_query`. Si no hay token configurado, queda en
 * modo no-op y sólo loguea (no rompe el arranque).
 */
@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot?: TelegramBot;
  private callbackHandler?: CallbackHandler;
  private lastPollingError?: string;
  private lastPollingLogAt = 0;
  private suppressedPollingErrors = 0;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.get('flags', { infer: true }).alertsEnabled) return;
    const token = this.config.get('channels', { infer: true }).telegram.token;
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN ausente: Telegram deshabilitado');
      return;
    }
    const { default: TelegramBotCtor } = await importEsm(
      'node-telegram-bot-api',
    );
    this.bot = new TelegramBotCtor(token, { polling: true });
    this.bot.on('callback_query', (query: CallbackQuery) =>
      this.onCallback(query),
    );
    this.bot.on('polling_error', (err: Error) => this.onPollingError(err));
    this.logger.log('Bot de Telegram iniciado');
  }

  onModuleDestroy(): void {
    void this.bot?.stopPolling();
  }

  /** Registra el handler de callbacks (lo provee EscalationService). */
  onCallbackData(handler: CallbackHandler): void {
    this.callbackHandler = handler;
  }

  /** Envía un mensaje simple sin botones. */
  async sendMessage(chatId: number | string, text: string): Promise<void> {
    if (!this.bot) return;
    try {
      await this.bot.sendMessage(chatId, text);
    } catch (err) {
      this.logger.error(`sendMessage(${chatId}): ${(err as Error).message}`);
    }
  }

  /** Envía una alarma con botón "Recibido" y, si `withCancel`, también "Cancelar". */
  async sendAlert(
    chatId: number | string,
    text: string,
    sensorId: string,
    withCancel: boolean,
  ): Promise<void> {
    if (!this.bot) return;
    const received: AlertCallbackData = {
      sensorId,
      received: true,
      canceled: false,
    };
    const canceled: AlertCallbackData = {
      sensorId,
      received: false,
      canceled: true,
    };
    const row: { text: string; callback_data: string }[] = [
      { text: 'Recibido', callback_data: JSON.stringify(received) },
    ];
    if (withCancel) {
      row.push({ text: 'Cancelar', callback_data: JSON.stringify(canceled) });
    }
    try {
      await this.bot.sendMessage(chatId, text, {
        reply_markup: { inline_keyboard: [row] },
      });
    } catch (err) {
      this.logger.error(`sendAlert(${chatId}): ${(err as Error).message}`);
    }
  }

  /**
   * El polling reintenta cada ~10 s mientras no haya red: loguea el primer
   * error de cada tipo y luego un resumen cada `POLLING_LOG_EVERY_MS`, en vez
   * de inundar el log. Incluye la causa real (EFATAL sólo dice "fetch failed";
   * el motivo — DNS, timeout, conexión rechazada — viene anidado en `cause`).
   */
  private onPollingError(err: Error): void {
    const detail = describeError(err);
    const now = Date.now();
    if (
      detail === this.lastPollingError &&
      now - this.lastPollingLogAt < POLLING_LOG_EVERY_MS
    ) {
      this.suppressedPollingErrors++;
      return;
    }
    const repeated = this.suppressedPollingErrors
      ? ` (+${this.suppressedPollingErrors} repetidos)`
      : '';
    this.logger.error(`Telegram polling: ${detail}${repeated}`);
    this.lastPollingError = detail;
    this.lastPollingLogAt = now;
    this.suppressedPollingErrors = 0;
  }

  private onCallback(query: CallbackQuery): void {
    void this.bot?.answerCallbackQuery(query.id).catch(() => undefined);
    if (!query.data || !this.callbackHandler) return;
    try {
      const data = JSON.parse(query.data) as AlertCallbackData;
      this.callbackHandler(data, query.message?.chat.id ?? query.from.id);
    } catch (err) {
      this.logger.error(`callback inválido: ${(err as Error).message}`);
    }
  }
}
