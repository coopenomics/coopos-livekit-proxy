import { WebhookReceiver } from 'livekit-server-sdk';
import type { Request, Response } from 'express';
import type { FanOutService } from './fan-out';
import type { Config } from './config';

/**
 * Обработчик входящих webhook-событий от LiveKit.
 * Валидирует подпись и запускает fan-out на контроллеры кооперативов.
 */
export class WebhookHandler {
  private receiver: WebhookReceiver;

  constructor(
    private readonly fanOut: FanOutService,
    config: Config
  ) {
    this.receiver = new WebhookReceiver(config.livekitApiKey, config.livekitApiSecret);
  }

  /**
   * Express handler для POST /livekit/webhook
   */
  async handle(req: Request, res: Response): Promise<void> {
    try {
      const rawBody = req.body as string; // body получен как raw string (см. express.text())
      const authHeader = req.get('Authorization');

      // Валидация подписи webhook от LiveKit
      let event;
      try {
        event = await this.receiver.receive(rawBody, authHeader);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[WebhookHandler] Невалидная подпись webhook:', message);
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }

      console.log(`[WebhookHandler] Получено событие: ${event.event}, комната: ${event.room?.name || 'N/A'}`);

      // Пересылаем на все кооперативы (fan-out)
      const result = await this.fanOut.forward(rawBody, authHeader);

      res.status(200).json({
        event: event.event,
        room: event.room?.name,
        fanOut: {
          total: result.total,
          success: result.success,
          failed: result.failed,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[WebhookHandler] Внутренняя ошибка:', message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
