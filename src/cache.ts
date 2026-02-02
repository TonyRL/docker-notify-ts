import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { CacheData } from './schema';

import { logger } from './logger';

const DEFAULT_CACHE_PATH = './config/cache.json';

export class Cache {
    private cachePath: string;

    constructor(cachePath: string = DEFAULT_CACHE_PATH) {
        this.cachePath = cachePath;
    }

    async getCache(): Promise<CacheData> {
        try {
            const data = await readFile(this.cachePath, 'utf8');
            return JSON.parse(data) as CacheData;
        } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
                await this.ensureDirectory();
                await writeFile(this.cachePath, '{}', 'utf8');
                return {};
            }
            logger.warn('Cache is corrupted or unreadable, recreating it');
            return {};
        }
    }

    async writeCache(cache: CacheData): Promise<void> {
        await this.ensureDirectory();
        await writeFile(this.cachePath, JSON.stringify(cache, null, 2), 'utf8');
    }

    private async ensureDirectory(): Promise<void> {
        const dir = dirname(this.cachePath);
        try {
            await mkdir(dir, { recursive: true });
        } catch {}
    }
}

export const cache = new Cache();
