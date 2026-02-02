import { parse as parseJsonc } from 'jsonc-parser';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { actionRegistry } from './actions';
import { cache } from './cache';
import { dockerAPI } from './dockerApi';
import { logger } from './logger';
import {
    ConfigSchema,
    type Config,
    type ParsedImage,
    type ParsedNotifyService,
    type CacheData,
    type CacheEntry,
    type RepositoryCheckResult,
    type UpdateInfo,
} from './schema';

function parseImageString(imageString: string): ParsedImage {
    const parts = imageString.split('/');
    const user = parts.length > 1 ? parts[0] : 'library';
    let nameWithTag = parts.length > 1 ? parts[1] : parts[0];

    const tagParts = nameWithTag.split(':');
    const name = tagParts[0];
    const tag = tagParts.length > 1 ? tagParts[1] : undefined;

    return { user, name, tag };
}

function getCacheKey(image: ParsedImage): string {
    let key = `${image.user}/${image.name}`;
    if (image.tag) {
        key += `:${image.tag}`;
    }
    return key;
}

function getImageDisplayName(image: ParsedImage): string {
    let displayName = image.user === 'library' ? image.name : `${image.user}/${image.name}`;
    if (image.tag) {
        displayName += `:${image.tag}`;
    }
    return displayName;
}

function getDockerHubUrl(image: ParsedImage): string {
    const baseName = image.user === 'library' ? `_/${image.name}` : `${image.user}/${image.name}`;
    return `https://hub.docker.com/r/${baseName}/tags`;
}

async function loadConfig(): Promise<Config> {
    const configDir = resolve(process.cwd(), 'config');
    const jsoncPath = resolve(configDir, 'config.jsonc');
    const jsonPath = resolve(configDir, 'config.json');

    let configContent: string;
    let configPath: string;
    let useJsonc = false;

    try {
        configContent = await readFile(jsoncPath, 'utf8');
        configPath = jsoncPath;
        useJsonc = true;
    } catch {
        try {
            configContent = await readFile(jsonPath, 'utf8');
            configPath = jsonPath;
        } catch (error) {
            logger.error({ error }, 'Failed to load configuration file');
            process.exit(1);
        }
    }

    try {
        const rawConfig = useJsonc ? parseJsonc(configContent) : JSON.parse(configContent);
        const result = ConfigSchema.safeParse(rawConfig);

        if (!result.success) {
            logger.error({ errors: result.error.format() }, 'Configuration validation failed');
            process.exit(2);
        }

        logger.info({ configPath }, 'Configuration loaded');
        return result.data;
    } catch (error) {
        logger.error({ error, configPath }, 'Failed to parse configuration file');
        process.exit(1);
    }
}

function parseNotifyServices(config: Config): ParsedNotifyService[] {
    return config.notifyServices.map((service) => ({
        ...service,
        image: parseImageString(service.image),
        originalImage: service.image,
    }));
}

async function checkRepository(
    job: ParsedNotifyService,
    cacheEntry: CacheEntry | undefined,
    token: string | null
): Promise<RepositoryCheckResult | null> {
    const { image } = job;

    try {
        let lastUpdated: string;

        if (image.tag) {
            const tags = await dockerAPI.getTags(image.user, image.name, token ?? undefined);
            const tagInfo = tags.find((t) => t.name === image.tag);

            if (!tagInfo) {
                logger.error({ repository: image.name, tag: image.tag }, 'Tag not found');
                return null;
            }

            lastUpdated = tagInfo.last_updated;
        } else {
            const repoInfo = await dockerAPI.getRepository(image.user, image.name, token ?? undefined);

            if (!repoInfo) {
                logger.error({ repository: image.name }, 'Repository not found');
                return null;
            }

            lastUpdated = repoInfo.last_updated;
        }

        const updated = cacheEntry ? Date.parse(cacheEntry.lastUpdated) < Date.parse(lastUpdated) : false;

        return {
            lastUpdated,
            name: image.name,
            user: image.user,
            tag: image.tag ?? null,
            updated,
            job,
        };
    } catch (error) {
        logger.error({ error, image }, 'Failed to check repository');
        return null;
    }
}

async function checkForUpdates(config: Config, services: ParsedNotifyService[]): Promise<void> {
    let token: string | null = null;

    if (config.dockerHubUsername && config.dockerHubPassword) {
        try {
            token = await dockerAPI.getToken(config.dockerHubUsername, config.dockerHubPassword);
        } catch {
            logger.warn('Failed to obtain Docker Hub token, proceeding without authentication');
        }
    }

    logger.info('Checking for updated repositories');

    const currentCache = await cache.getCache();
    const checkPromises: Promise<RepositoryCheckResult | null>[] = [];

    for (const service of services) {
        const key = getCacheKey(service.image);
        logger.info({ image: key }, 'Checking image');
        checkPromises.push(checkRepository(service, currentCache[key], token));
    }

    const results = await Promise.all(checkPromises);
    const validResults = results.filter((r): r is RepositoryCheckResult => r !== null);

    const newCache: CacheData = {};
    const updatedRepos: {
        result: RepositoryCheckResult;
        updateInfo: UpdateInfo;
    }[] = [];

    for (const result of validResults) {
        const key = getCacheKey(result.job.image);

        newCache[key] = {
            user: result.user,
            name: result.name,
            lastUpdated: result.lastUpdated,
            ...(result.tag ? { tag: result.tag } : {}),
        };

        if (result.updated) {
            const imageName = getImageDisplayName(result.job.image);
            updatedRepos.push({
                result,
                updateInfo: {
                    imageName,
                    imageUrl: getDockerHubUrl(result.job.image),
                    lastUpdated: result.lastUpdated,
                },
            });
        }
    }

    await cache.writeCache(newCache);

    if (updatedRepos.length > 0) {
        logger.info({ count: updatedRepos.length }, 'Updates detected');

        for (const { result, updateInfo } of updatedRepos) {
            for (const action of result.job.actions) {
                await actionRegistry.executeAction(action, updateInfo, {
                    config,
                    logger,
                });
            }
        }
    } else {
        logger.info('No updates found');
    }
}

async function main(): Promise<void> {
    logger.info('Docker Notify starting...');

    const config = await loadConfig();
    const services = parseNotifyServices(config);

    if (!actionRegistry.validateAllActions(config)) {
        logger.error('Configuration references undefined action instances');
        process.exit(3);
    }

    const checkIntervalMs = (config.checkInterval || 60) * 60 * 1000;

    await checkForUpdates(config, services);

    setInterval(() => {
        checkForUpdates(config, services).catch((error) => {
            logger.error({ error }, 'Error during update check');
        });
    }, checkIntervalMs);

    logger.info({ intervalMinutes: config.checkInterval || 60 }, 'Scheduled periodic update checks');
}

main().catch((error) => {
    logger.fatal({ error }, 'Unhandled error in main');
    process.exit(1);
});
