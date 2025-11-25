import axios from 'axios';
import type { Logger } from '@battlescope/logger';

/**
 * Historical killmail entry from ZKillboard's history API
 * Format: [killmail_id, "hash"]
 */
type HistoricalKillmail = [number, string];

export interface ZKillboardHistoryOptions {
  userAgent: string;
  baseUrl?: string;
  requestDelayMs?: number;
}

/**
 * Client for fetching historical killmail data from ZKillboard
 * Uses the History API: https://zkillboard.com/api/history/YYYYMMDD.json
 */
export class ZKillboardHistoryClient {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly requestDelayMs: number;
  private lastRequestTime = 0;

  constructor(
    private logger: Logger,
    options: ZKillboardHistoryOptions
  ) {
    this.baseUrl = options.baseUrl || 'https://zkillboard.com/api';
    this.userAgent = options.userAgent;
    this.requestDelayMs = options.requestDelayMs || 1000; // 1 second between requests
  }

  /**
   * Fetch killmails for a specific date
   * @param date Date to fetch killmails for
   * @returns Array of [killmail_id, hash] tuples
   */
  async fetchDate(date: Date): Promise<HistoricalKillmail[]> {
    const dateStr = this.formatDate(date);
    const url = `${this.baseUrl}/history/${dateStr}.json`;

    // Rate limiting
    await this.waitForRateLimit();

    try {
      this.logger.info('Fetching historical killmails', { date: dateStr, url });

      const response = await axios.get<HistoricalKillmail[]>(url, {
        timeout: 30000,
        headers: {
          'User-Agent': this.userAgent,
        },
      });

      const killmails = response.data;
      this.logger.info('Fetched historical killmails', {
        date: dateStr,
        count: killmails.length,
      });

      return killmails;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        // No killmails for this date (or date in the future)
        this.logger.warn('No killmails found for date', { date: dateStr });
        return [];
      }

      this.logger.error('Failed to fetch historical killmails', {
        date: dateStr,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Fetch killmails for a date range
   * @param startDate Start date (inclusive)
   * @param endDate End date (inclusive)
   * @returns Map of date string to killmails
   */
  async fetchDateRange(
    startDate: Date,
    endDate: Date
  ): Promise<Map<string, HistoricalKillmail[]>> {
    const results = new Map<string, HistoricalKillmail[]>();
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateStr = this.formatDate(currentDate);
      const killmails = await this.fetchDate(currentDate);
      results.set(dateStr, killmails);

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return results;
  }

  /**
   * Format date as YYYYMMDD
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Wait to respect rate limiting
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.requestDelayMs) {
      const waitTime = this.requestDelayMs - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }
}
