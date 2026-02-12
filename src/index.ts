import 'dotenv/config';

import express from 'express';
import { loadConfig } from './config';
import { CoopRegistry } from './coop-registry';
import { FanOutService } from './fan-out';
import { WebhookHandler } from './webhook-handler';

async function main(): Promise<void> {
  console.log('[chatcoop-proxy] Запуск...');

  // Загрузка конфигурации
  const config = loadConfig();

  // Инициализация реестра кооперативов
  const coopRegistry = new CoopRegistry(config);
  await coopRegistry.start();

  // Инициализация сервиса пересылки
  const fanOut = new FanOutService(coopRegistry, config);

  // Инициализация обработчика webhook
  const webhookHandler = new WebhookHandler(fanOut, config);

  // HTTP-сервер
  const app = express();

  // LiveKit отправляет webhook как application/webhook+json — принимаем как raw text
  // чтобы сохранить оригинальное тело для пробрасывания подписи
  app.post(
    '/livekit/webhook',
    express.text({ type: '*/*' }),
    (req, res) => webhookHandler.handle(req, res)
  );

  // Health check
  app.get('/health', (_req, res) => {
    const coops = coopRegistry.getActiveCoops();
    res.json({
      status: 'ok',
      activeCoops: coops.length,
      coopNames: coops.map((c) => c.username),
    });
  });

  // Запуск сервера
  app.listen(config.port, () => {
    console.log(`[chatcoop-proxy] HTTP-сервер запущен на порту ${config.port}`);
  });

  // Graceful shutdown
  const shutdown = (): void => {
    console.log('[chatcoop-proxy] Завершение...');
    coopRegistry.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[chatcoop-proxy] Критическая ошибка запуска:', err);
  process.exit(1);
});
