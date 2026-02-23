import axios from 'axios';
import type { CoopRegistry } from './coop-registry';
import type { Config } from './config';

/**
 * Сервис пересылки (fan-out) webhook-событий LiveKit
 * на контроллеры всех активных кооперативов.
 *
 * Адрес контроллера конструируется из поля announce кооператива:
 *   https://{announce}/{API_PREFIX}/v1/extensions/chatcoop/livekit-webhook
 *   Где API_PREFIX берется из переменной окружения API_PREFIX (по умолчанию: backend)
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

    // Парсим rawBody один раз для всех отправок
    const jsonBody = JSON.parse(rawBody);
    console.log(jsonBody)
    const results: FanOutItemResult[] = [];
    const errors: Array<{ coop: string; error: string }> = [];

    // Обрабатываем каждый кооператив отдельно с retry логикой
    for (const coop of coops) {
      let success = false;
      let lastError: string = '';

      // Временное исключение для кооператива voskhod (только в development)
      let url: string;
      if (coop.username === 'voskhod' && process.env.NODE_ENV === 'development') {
        url = 'http://176.222.53.50:2998/v1/extensions/chatcoop/livekit-webhook';
      } else {
        const prefix = this.config.apiPrefix ? `/${this.config.apiPrefix}` : '';
        url = `https://${coop.announce}${prefix}/v1/extensions/chatcoop/livekit-webhook`;
      }

      // Пытаемся отправить до 3 раз
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await axios.post(url, jsonBody, {
            headers: {
              'Content-Type': 'application/json',
              // Пробрасываем оригинальный заголовок авторизации LiveKit
              ...(authHeader ? { Authorization: authHeader } : {}),
            },
            timeout: this.config.fanOutTimeoutMs,
          });

          success = true;
          console.log(`[FanOut] Успешно отправлено на ${coop.username} с ${attempt} попытки`);
          break; // Выходим из цикла retry при успехе

        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          lastError = message;

          if (attempt < 3) {
            console.warn(`[FanOut] Попытка ${attempt} для ${coop.username} не удалась, повторяем:`, message);
            // Небольшая задержка перед следующей попыткой
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            console.error(`[FanOut] Все 3 попытки для ${coop.username} не удались (${url}):`, message);
          }
        }
      }

      results.push({ coop: coop.username, success });
      if (!success) {
        errors.push({ coop: coop.username, error: lastError || 'unknown' });
      }
    }

    const succeeded = results.filter(r => r.success).length;
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
