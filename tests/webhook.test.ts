import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { UpdateInfo, Config, WebhookAction } from '../src/schema';

import { webhookAction } from '../src/actions/webhook';
import { logger } from '../src/logger';

vi.mock('got', () => ({
    default: vi.fn(),
}));

import got from 'got';

describe('webhookAction', () => {
    const mockGot = vi.mocked(got);

    beforeEach(() => {
        vi.clearAllMocks();
        mockGot.mockResolvedValue({ statusCode: 200 } as any);
    });

    describe('type', () => {
        it('should have correct type', () => {
            expect(webhookAction.type).toBe('webHook');
        });
    });

    describe('execute', () => {
        it('should execute webhook with correct parameters', async () => {
            const action: WebhookAction = {
                type: 'webHook',
                instance: 'testHook',
            };
            const updateInfo: UpdateInfo = {
                imageName: 'nginx:latest',
                imageUrl: 'https://hub.docker.com/r/nginx/tags',
                lastUpdated: '2024-01-01',
            };
            const config: Config = {
                checkInterval: 60,
                notifyServices: [],
                webHooks: {
                    testHook: {
                        reqUrl: 'https://example.com/webhook',
                        httpMethod: 'POST',
                        httpHeaders: { 'X-Custom': 'header' },
                        httpBody: { message: '$msg' },
                    },
                },
            };

            await webhookAction.execute(action, updateInfo, { config, logger });

            expect(mockGot).toHaveBeenCalledWith(
                'https://example.com/webhook',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'X-Custom': 'header' },
                    json: expect.objectContaining({
                        message: expect.stringContaining('nginx:latest'),
                    }),
                })
            );
        });

        it('should replace $msg placeholder in body', async () => {
            const action: WebhookAction = {
                type: 'webHook',
                instance: 'testHook',
            };
            const updateInfo: UpdateInfo = {
                imageName: 'myimage',
                imageUrl: 'https://hub.docker.com/r/myimage/tags',
                lastUpdated: '2024-01-01',
            };
            const config: Config = {
                checkInterval: 60,
                notifyServices: [],
                webHooks: {
                    testHook: {
                        reqUrl: 'https://example.com',
                        httpMethod: 'POST',
                        httpHeaders: null,
                        httpBody: { text: 'Update: $msg' },
                    },
                },
            };

            await webhookAction.execute(action, updateInfo, { config, logger });

            expect(mockGot).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    json: { text: expect.stringContaining('myimage') },
                })
            );
        });

        it('should handle missing webhook config', async () => {
            const action: WebhookAction = {
                type: 'webHook',
                instance: 'nonExistent',
            };
            const updateInfo: UpdateInfo = {
                imageName: 'nginx',
                imageUrl: 'https://hub.docker.com/r/nginx/tags',
                lastUpdated: '2024-01-01',
            };
            const config: Config = {
                checkInterval: 60,
                notifyServices: [],
            };

            const loggerSpy = vi.spyOn(logger, 'error');
            await webhookAction.execute(action, updateInfo, { config, logger });

            expect(loggerSpy).toHaveBeenCalledWith({ instance: 'nonExistent' }, 'Webhook configuration not found');
            expect(mockGot).not.toHaveBeenCalled();
        });

        it('should handle webhook execution error', async () => {
            mockGot.mockRejectedValue(new Error('Network error'));

            const action: WebhookAction = {
                type: 'webHook',
                instance: 'testHook',
            };
            const updateInfo: UpdateInfo = {
                imageName: 'nginx',
                imageUrl: 'https://hub.docker.com/r/nginx/tags',
                lastUpdated: '2024-01-01',
            };
            const config: Config = {
                checkInterval: 60,
                notifyServices: [],
                webHooks: {
                    testHook: {
                        reqUrl: 'https://example.com',
                        httpMethod: 'POST',
                        httpHeaders: null,
                        httpBody: null,
                    },
                },
            };

            const loggerSpy = vi.spyOn(logger, 'error');
            await webhookAction.execute(action, updateInfo, { config, logger });

            expect(loggerSpy).toHaveBeenCalledWith(
                expect.objectContaining({ instance: 'testHook' }),
                'Webhook execution failed'
            );
        });
    });

    describe('validateInstance', () => {
        it('should return true for valid instance', () => {
            const action: WebhookAction = {
                type: 'webHook',
                instance: 'myHook',
            };
            const config: Config = {
                checkInterval: 60,
                notifyServices: [],
                webHooks: {
                    myHook: {
                        reqUrl: 'https://example.com',
                        httpMethod: 'POST',
                        httpHeaders: null,
                        httpBody: null,
                    },
                },
            };

            expect(webhookAction.validateInstance(action, config)).toBe(true);
        });

        it('should return false for invalid instance', () => {
            const action: WebhookAction = {
                type: 'webHook',
                instance: 'nonExistent',
            };
            const config: Config = { checkInterval: 60, notifyServices: [] };

            expect(webhookAction.validateInstance(action, config)).toBe(false);
        });

        it('should return false for wrong action type', () => {
            const action = {
                type: 'mailHook',
                instance: 'test',
                recipient: 'a@b.com',
            };
            const config: Config = { checkInterval: 60, notifyServices: [] };

            expect(webhookAction.validateInstance(action, config)).toBe(false);
        });
    });
});
