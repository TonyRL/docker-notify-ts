import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ActionHandler } from '../src/actions/base';
import type { Config, UpdateInfo } from '../src/schema';

import { ActionRegistry } from '../src/actions/index';
import { logger } from '../src/logger';

describe('ActionRegistry', () => {
    let registry: ActionRegistry;

    beforeEach(() => {
        registry = new ActionRegistry();
    });

    describe('constructor', () => {
        it('should register built-in handlers', () => {
            expect(registry.getHandler('mailHook')).toBeDefined();
            expect(registry.getHandler('webHook')).toBeDefined();
        });
    });

    describe('register', () => {
        it('should register new handler', () => {
            const customHandler: ActionHandler = {
                type: 'customAction',
                execute: vi.fn(),
                validateInstance: vi.fn().mockReturnValue(true),
            };

            registry.register(customHandler);

            expect(registry.getHandler('customAction')).toBe(customHandler);
        });
    });

    describe('getHandler', () => {
        it('should return undefined for unknown type', () => {
            expect(registry.getHandler('unknownType')).toBeUndefined();
        });
    });

    describe('getAllHandlers', () => {
        it('should return all registered handlers', () => {
            const handlers = registry.getAllHandlers();
            expect(handlers).toHaveLength(2);
            expect(handlers.map((h) => h.type)).toContain('mailHook');
            expect(handlers.map((h) => h.type)).toContain('webHook');
        });
    });

    describe('executeAction', () => {
        it('should execute action with correct handler', async () => {
            const mockHandler: ActionHandler = {
                type: 'testAction',
                execute: vi.fn(),
                validateInstance: vi.fn().mockReturnValue(true),
            };
            registry.register(mockHandler);

            const action = { type: 'testAction' as const, instance: 'test' };
            const updateInfo: UpdateInfo = {
                imageName: 'nginx:latest',
                imageUrl: 'https://hub.docker.com/r/nginx/tags',
                lastUpdated: '2024-01-01',
            };
            const config = { notifyServices: [] } as unknown as Config;

            await registry.executeAction(action as any, updateInfo, {
                config,
                logger,
            });

            expect(mockHandler.execute).toHaveBeenCalledWith(action, updateInfo, { config, logger });
        });

        it('should log error for unknown action type', async () => {
            const action = { type: 'unknownAction' as const, instance: 'test' };
            const updateInfo: UpdateInfo = {
                imageName: 'nginx',
                imageUrl: 'https://hub.docker.com/r/nginx/tags',
                lastUpdated: '2024-01-01',
            };
            const config = { notifyServices: [] } as unknown as Config;

            const loggerSpy = vi.spyOn(logger, 'error');

            await registry.executeAction(action as any, updateInfo, {
                config,
                logger,
            });

            expect(loggerSpy).toHaveBeenCalledWith({ actionType: 'unknownAction' }, 'Unknown action type, skipping');
        });
    });

    describe('validateAllActions', () => {
        it('should return true for valid config', () => {
            const config: Config = {
                checkInterval: 60,
                notifyServices: [
                    {
                        image: 'nginx',
                        actions: [{ type: 'webHook', instance: 'myHook' }],
                    },
                ],
                webHooks: {
                    myHook: {
                        reqUrl: 'https://example.com',
                        httpMethod: 'POST',
                        httpHeaders: null,
                        httpBody: null,
                    },
                },
            };

            expect(registry.validateAllActions(config)).toBe(true);
        });

        it('should return false for unknown action type', () => {
            const config = {
                checkInterval: 60,
                notifyServices: [
                    {
                        image: 'nginx',
                        actions: [{ type: 'unknownType', instance: 'test' }],
                    },
                ],
            } as unknown as Config;

            expect(registry.validateAllActions(config)).toBe(false);
        });

        it('should return false for invalid instance reference', () => {
            const config: Config = {
                checkInterval: 60,
                notifyServices: [
                    {
                        image: 'nginx',
                        actions: [{ type: 'webHook', instance: 'nonExistent' }],
                    },
                ],
            };

            expect(registry.validateAllActions(config)).toBe(false);
        });
    });
});
