/**
 * Destinatarios y reglas de escalado de alertas de temperatura, por departamento.
 *
 * Extraído textualmente de los nodos "Message Handle" de cada flujo de Node-RED.
 * Versionado en git (no contiene secretos, sólo chatIds/emails internos).
 *
 * Modelo de escalado (igual que Node-RED):
 *  - `groups` es una lista de NIVELES. Cuando una alarma no se reconoce, se
 *    reenvía cada `escalation.resendInterval` y se avanza al siguiente nivel
 *    (sumando destinatarios), hasta el último.
 *  - Un destinatario sólo recibe el mensaje si la hora actual está dentro de su
 *    `workingHours` ([inicio, fin]; se omite si `hora < inicio || hora > fin`).
 *  - `admin: true` agrega el botón "Cancelar" (silencia la alarma) además de
 *    "Recibido". Los no-admin además disparan los emails de `emails`.
 */

export interface AlertRecipient {
  chatId: string;
  /** [horaInicio, horaFin] en hora local 0-23. */
  workingHours: [number, number];
  admin: boolean;
}

export interface DepartmentAlertConfig {
  /** Niveles de escalado; cada nivel es un grupo de destinatarios. */
  groups: AlertRecipient[][];
  /** Emails notificados cuando se dispara un destinatario no-admin. */
  emails: string[];
  /** Asunto del email. */
  emailSubject: string;
}

/** Texto del mensaje de alarma de temperatura (común a Telegram y email). */
export function temperatureAlertMessage(sensor: {
  type?: string;
  name: string;
  location: string;
  labId: string;
}): string {
  const prefix = sensor.type ? `${sensor.type}: ` : '';
  return (
    `${prefix}${sensor.name} fuera de temperatura.\n` +
    `Area: ${sensor.location}.\n` +
    `Codigo: ${sensor.labId}`
  );
}

export const RECIPIENTS: Record<string, DepartmentAlertConfig> = {
  laboratorio: {
    groups: [
      [
        { chatId: '5083746157', workingHours: [0, 24], admin: false }, // Franco
        { chatId: '7194476256', workingHours: [0, 24], admin: false }, // Tecnico
        { chatId: '7010159330', workingHours: [0, 24], admin: false }, // Bioquimico
      ],
      [
        { chatId: '5083746157', workingHours: [0, 24], admin: true },
        { chatId: '7194476256', workingHours: [0, 24], admin: true },
        { chatId: '7010159330', workingHours: [0, 24], admin: true },
        { chatId: '6631285277', workingHours: [7, 22], admin: true }, // Daniel Bernatebe
        //{ chatId: '7468417252', workingHours: [7, 22], admin: true }, // Cristian Lozano
      ],
      [
        { chatId: '5083746157', workingHours: [0, 24], admin: true },
        { chatId: '7194476256', workingHours: [0, 24], admin: true },
        { chatId: '7010159330', workingHours: [0, 24], admin: true },
        { chatId: '6631285277', workingHours: [7, 22], admin: true },
        //{ chatId: '7468417252', workingHours: [7, 22], admin: true },
        { chatId: '7210451021', workingHours: [7, 22], admin: true }, // Veronica
      ],
    ],
    emails: [],
    emailSubject: 'Heladera fuera de temperatura',
  },

  farmacia: {
    groups: [
      [
        { chatId: '5083746157', workingHours: [0, 24], admin: false }
      ],
      [
        { chatId: '5083746157', workingHours: [0, 24], admin: true }
      ],
    ],
    emails: [
      'farmacia@sanjuandedios.org.ar',
      'supervisiondefarmacia@sanjuandedios.org.ar',
      'franco.cejas@sanjuandedios.org.ar',
    ],
    emailSubject: 'Heladera fuera de temperatura',
  },

  sistemas: {
    groups: [
      [{ chatId: '5083746157', workingHours: [0, 24], admin: false }],
      [{ chatId: '5083746157', workingHours: [0, 24], admin: true }],
    ],
    emails: [
      'franco.cejas@sanjuandedios.org.ar',
      'mesadeayuda@sanjuandedios.org.ar',
    ],
    emailSubject: 'Datacenter fuera de temperatura',
  },
};
