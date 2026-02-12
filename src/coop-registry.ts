import axios from 'axios';
import type { Config } from './config';

/**
 * Запись о кооперативе из блокчейна (таблица coops контракта registrator)
 */
export interface CoopEntry {
  username: string;
  announce: string;
  is_cooperative: boolean;
  status: string;
}

/**
 * Реестр активных кооперативов.
 * Периодически опрашивает блокчейн (get_table_rows) и кеширует список
 * кооперативов с непустым announce (URL сайта).
 */
export class CoopRegistry {
  private coops: Map<string, CoopEntry> = new Map();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private isRefreshing = false;

  constructor(private readonly config: Config) {}

  /**
   * Запустить периодическое обновление реестра
   */
  async start(): Promise<void> {
    // Первоначальная загрузка
    await this.refresh();

    // Периодическое обновление
    this.refreshTimer = setInterval(() => {
      this.refresh().catch((err) => {
        console.error('[CoopRegistry] Ошибка обновления реестра:', err.message);
      });
    }, this.config.coopRefreshIntervalMs);
  }

  /**
   * Остановить обновление
   */
  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Получить список активных кооперативов с непустым announce
   */
  getActiveCoops(): CoopEntry[] {
    return Array.from(this.coops.values());
  }

  /**
   * Загрузить таблицу coops из блокчейна через get_table_rows
   */
  private async refresh(): Promise<void> {
    if (this.isRefreshing) return;
    this.isRefreshing = true;

    try {
      const rows = await this.fetchAllCoopsRows();
      const newCoops = new Map<string, CoopEntry>();

      for (const row of rows) {
        // Фильтруем: только активные кооперативы с непустым announce
        if (row.is_cooperative && row.status === 'active' && row.announce && row.announce.trim() !== '') {
          newCoops.set(row.username, {
            username: row.username,
            announce: row.announce.trim(),
            is_cooperative: row.is_cooperative,
            status: row.status,
          });
        }
      }

      this.coops = newCoops;
      console.log(`[CoopRegistry] Обновлено: ${newCoops.size} активных кооперативов`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[CoopRegistry] Не удалось обновить реестр:', message);
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Постраничная загрузка всех строк таблицы coops
   */
  private async fetchAllCoopsRows(): Promise<CoopEntry[]> {
    const allRows: CoopEntry[] = [];
    let lowerBound = '';
    const limit = 1000;

    while (true) {
      const response = await axios.post<GetTableRowsResponse>(
        `${this.config.blockchainApiUrl}/v1/chain/get_table_rows`,
        {
          code: this.config.registratorContract,
          scope: this.config.registratorContract,
          table: 'coops',
          json: true,
          limit,
          lower_bound: lowerBound || undefined,
        },
        { timeout: 10000 }
      );

      const { rows, more, next_key } = response.data;

      if (!rows || rows.length === 0) break;

      allRows.push(...rows);

      if (!more) break;
      lowerBound = next_key || '';
    }

    return allRows;
  }
}

interface GetTableRowsResponse {
  rows: CoopEntry[];
  more: boolean;
  next_key: string;
}
