import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Cache } from '../src/cache';

const TEST_CACHE_PATH = './test-cache/cache.json';

describe('Cache', () => {
    let cacheInstance: Cache;

    beforeEach(async () => {
        cacheInstance = new Cache(TEST_CACHE_PATH);
    });

    afterEach(async () => {
        try {
            await rm('./test-cache', { recursive: true, force: true });
        } catch {}
    });

    describe('getCache', () => {
        it('should create empty cache if file does not exist', async () => {
            const result = await cacheInstance.getCache();
            expect(result).toEqual({});
        });

        it('should read existing cache', async () => {
            await mkdir('./test-cache', { recursive: true });
            const cacheData = {
                'library/nginx:latest': {
                    user: 'library',
                    name: 'nginx',
                    tag: 'latest',
                    lastUpdated: '2024-01-01T00:00:00Z',
                },
            };
            await writeFile(TEST_CACHE_PATH, JSON.stringify(cacheData), 'utf8');

            const result = await cacheInstance.getCache();
            expect(result).toEqual(cacheData);
        });

        it('should return empty object for corrupted cache', async () => {
            await mkdir('./test-cache', { recursive: true });
            await writeFile(TEST_CACHE_PATH, 'invalid json {{{', 'utf8');

            const result = await cacheInstance.getCache();
            expect(result).toEqual({});
        });
    });

    describe('writeCache', () => {
        it('should write cache to file', async () => {
            const cacheData = {
                'library/nginx:latest': {
                    user: 'library',
                    name: 'nginx',
                    tag: 'latest',
                    lastUpdated: '2024-01-01T00:00:00Z',
                },
            };

            await cacheInstance.writeCache(cacheData);

            const fileContent = await readFile(TEST_CACHE_PATH, 'utf8');
            expect(JSON.parse(fileContent)).toEqual(cacheData);
        });

        it('should create directory if it does not exist', async () => {
            const deepCache = new Cache('./test-cache/deep/nested/cache.json');
            const cacheData = {
                test: { user: 'test', name: 'test', lastUpdated: 'now' },
            };

            await deepCache.writeCache(cacheData);

            const fileContent = await readFile('./test-cache/deep/nested/cache.json', 'utf8');
            expect(JSON.parse(fileContent)).toEqual(cacheData);
        });
    });
});
