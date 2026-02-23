/**
 * Конфигурация chatcoop-proxy из переменных окружения
 */
export interface Config {
  /** Порт HTTP-сервера */
  port: number;

  /** LiveKit API Key для валидации подписи webhook */
  livekitApiKey: string;

  /** LiveKit API Secret для валидации подписи webhook */
  livekitApiSecret: string;

  /** URL ноды блокчейна для get_table_rows */
  blockchainApiUrl: string;

  /** Имя контракта registrator */
  registratorContract: string;

  /** Интервал обновления реестра кооперативов (ms) */
  coopRefreshIntervalMs: number;

  /** Таймаут при пересылке webhook на контроллер (ms) */
  fanOutTimeoutMs: number;

  /** Префикс пути к API контроллера (без слеша) */
  apiPrefix: string;
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Переменная окружения ${key} не задана`);
  }
  return value;
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export function loadConfig(): Config {
  return {
    port: parseInt(getEnvOrDefault('PORT', '3100'), 10),
    livekitApiKey: getEnvOrThrow('LIVEKIT_API_KEY'),
    livekitApiSecret: getEnvOrThrow('LIVEKIT_API_SECRET'),
    blockchainApiUrl: getEnvOrThrow('BLOCKCHAIN_API_URL'),
    registratorContract: getEnvOrDefault('REGISTRATOR_CONTRACT', 'registrator'),
    coopRefreshIntervalMs: parseInt(getEnvOrDefault('COOP_REFRESH_INTERVAL_MS', '300000'), 10),
    fanOutTimeoutMs: parseInt(getEnvOrDefault('FAN_OUT_TIMEOUT_MS', '5000'), 10),
    apiPrefix: getEnvOrDefault('API_PREFIX', 'backend'),
  };
}
