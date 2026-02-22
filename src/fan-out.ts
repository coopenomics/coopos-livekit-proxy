import axios from 'axios';
import type { CoopRegistry } from './coop-registry';
import type { Config } from './config';

/**
 * Сервис пересылки (fan-out) webhook-событий LiveKit
 * на контроллеры всех активных кооперативов.
 *
 * Адрес контроллера конструируется из поля announce кооператива:
 *   https://{announce}/backend/v1/chatcoop/livekit-webhook
 */
export class FanOutService {
  constructor(
    private readonly coopRegistry: CoopRegistry,
    private readonly config: Config
  ) {}

  /**
   * Переслать webhook-событие на все активные кооперативы
   *
   * @param rawBody - оригинальное тело webhook (строка для сохранения подписи)
   * @param authHeader - заголовок Authorization от LiveKit
   */
  async forward(rawBody: string, authHeader: string | undefined): Promise<FanOutResult> {
    const coops = this.coopRegistry.getActiveCoops();

    if (coops.length === 0) {
      console.warn('[FanOut] Нет активных кооперативов для пересылки');
      return { total: 0, success: 0, failed: 0, errors: [] };
    }

    const results = await Promise.allSettled(
      coops.map(async (coop) => {
        const url = `https://${coop.announce}/backend/v1/extensions/chatcoop/livekit-webhook`;

        try {
          await axios.post(url, rawBody, {
            headers: {
              'Content-Type': 'application/webhook+json',
              // Пробрасываем оригинальный заголовок авторизации LiveKit
              ...(authHeader ? { Authorization: authHeader } : {}),
            },
            timeout: this.config.fanOutTimeoutMs,
            // Отправляем как строку, чтобы сохранить оригинальную подпись
            transformRequest: [(data: string) => data],
          });

          return { coop: coop.username, success: true };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[FanOut] Ошибка отправки на ${coop.username} (${url}):`, message);
          return { coop: coop.username, success: false, error: message };
        }
      })
    );

    const succeeded = results.filter(
      (r) => r.status === 'fulfilled' && r.value.success
    ).length;

    const errors = results
      .filter((r): r is PromiseFulfilledResult<FanOutItemResult> =>
        r.status === 'fulfilled' && !r.value.success
      )
      .map((r) => ({ coop: r.value.coop, error: r.value.error || 'unknown' }));

    console.log(`[FanOut] Переслано: ${succeeded}/${coops.length} успешно`);

    return {
      total: coops.length,
      success: succeeded,
      failed: coops.length - succeeded,
      errors,
    };
  }
}

interface FanOutItemResult {
  coop: string;
  success: boolean;
  error?: string;
}

export interface FanOutResult {
  total: number;
  success: number;
  failed: number;
  errors: Array<{ coop: string; error: string }>;
}
