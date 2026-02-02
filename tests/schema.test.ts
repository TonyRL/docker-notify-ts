import { describe, it, expect } from 'vitest';

import {
    ConfigSchema,
    WebhookActionSchema,
    MailHookActionSchema,
    NotifyServiceSchema,
    SmtpServerConfigSchema,
    WebhookConfigSchema,
} from '../src/schema';

describe('ConfigSchema', () => {
    describe('WebhookActionSchema', () => {
        it('should validate correct webhook action', () => {
            const action = { type: 'webHook', instance: 'myWebhook' };
            expect(WebhookActionSchema.safeParse(action).success).toBe(true);
        });

        it('should reject empty instance', () => {
            const action = { type: 'webHook', instance: '' };
            expect(WebhookActionSchema.safeParse(action).success).toBe(false);
        });

        it('should reject missing instance', () => {
            const action = { type: 'webHook' };
            expect(WebhookActionSchema.safeParse(action).success).toBe(false);
        });
    });

    describe('MailHookActionSchema', () => {
        it('should validate correct mail hook action', () => {
            const action = {
                type: 'mailHook',
                instance: 'mySmtp',
                recipient: 'test@example.com',
            };
            expect(MailHookActionSchema.safeParse(action).success).toBe(true);
        });

        it('should reject invalid email', () => {
            const action = {
                type: 'mailHook',
                instance: 'mySmtp',
                recipient: 'invalid-email',
            };
            expect(MailHookActionSchema.safeParse(action).success).toBe(false);
        });

        it('should reject missing recipient', () => {
            const action = { type: 'mailHook', instance: 'mySmtp' };
            expect(MailHookActionSchema.safeParse(action).success).toBe(false);
        });
    });

    describe('NotifyServiceSchema', () => {
        it('should validate correct notify service', () => {
            const service = {
                image: 'nginx:latest',
                actions: [{ type: 'webHook', instance: 'myHook' }],
            };
            expect(NotifyServiceSchema.safeParse(service).success).toBe(true);
        });

        it('should reject empty actions array', () => {
            const service = { image: 'nginx:latest', actions: [] };
            expect(NotifyServiceSchema.safeParse(service).success).toBe(false);
        });

        it('should reject empty image string', () => {
            const service = {
                image: '',
                actions: [{ type: 'webHook', instance: 'myHook' }],
            };
            expect(NotifyServiceSchema.safeParse(service).success).toBe(false);
        });
    });

    describe('SmtpServerConfigSchema', () => {
        it('should validate correct SMTP config', () => {
            const config = {
                host: 'mail.example.com',
                port: 587,
                secure: true,
                sendername: 'Docker Notify',
                senderadress: 'notify@example.com',
                username: 'user',
                password: 'pass',
            };
            expect(SmtpServerConfigSchema.safeParse(config).success).toBe(true);
        });

        it('should apply defaults', () => {
            const config = {
                sendername: 'Test',
                senderadress: 'test@example.com',
            };
            const result = SmtpServerConfigSchema.parse(config);
            expect(result.host).toBe('127.0.0.1');
            expect(result.port).toBe(25);
            expect(result.secure).toBe(true);
        });

        it('should reject invalid port', () => {
            const config = {
                host: 'mail.example.com',
                port: 99999,
                sendername: 'Test',
                senderadress: 'test@example.com',
            };
            expect(SmtpServerConfigSchema.safeParse(config).success).toBe(false);
        });

        it('should reject invalid email for senderadress', () => {
            const config = {
                sendername: 'Test',
                senderadress: 'invalid-email',
            };
            expect(SmtpServerConfigSchema.safeParse(config).success).toBe(false);
        });

        it('should reject short sendername', () => {
            const config = {
                sendername: 'ab',
                senderadress: 'test@example.com',
            };
            expect(SmtpServerConfigSchema.safeParse(config).success).toBe(false);
        });
    });

    describe('WebhookConfigSchema', () => {
        it('should validate correct webhook config', () => {
            const config = {
                reqUrl: 'https://example.com/webhook',
                httpMethod: 'POST',
                httpHeaders: { 'Content-Type': 'application/json' },
                httpBody: { message: '$msg' },
            };
            expect(WebhookConfigSchema.safeParse(config).success).toBe(true);
        });

        it('should apply defaults', () => {
            const config = { reqUrl: 'https://example.com/webhook' };
            const result = WebhookConfigSchema.parse(config);
            expect(result.httpMethod).toBe('POST');
            expect(result.httpHeaders).toBeNull();
            expect(result.httpBody).toBeNull();
        });

        it('should reject invalid URL', () => {
            const config = { reqUrl: 'not-a-url' };
            expect(WebhookConfigSchema.safeParse(config).success).toBe(false);
        });

        it('should reject invalid HTTP method', () => {
            const config = {
                reqUrl: 'https://example.com/webhook',
                httpMethod: 'PATCH',
            };
            expect(WebhookConfigSchema.safeParse(config).success).toBe(false);
        });
    });

    describe('Full ConfigSchema', () => {
        it('should validate complete config', () => {
            const config = {
                dockerHubUsername: 'user',
                dockerHubPassword: 'pass',
                checkInterval: 30,
                notifyServices: [
                    {
                        image: 'nginx:latest',
                        actions: [{ type: 'webHook', instance: 'myHook' }],
                    },
                ],
                webHooks: {
                    myHook: { reqUrl: 'https://example.com/webhook' },
                },
            };
            expect(ConfigSchema.safeParse(config).success).toBe(true);
        });

        it('should apply default checkInterval', () => {
            const config = {
                notifyServices: [
                    {
                        image: 'nginx',
                        actions: [{ type: 'webHook', instance: 'myHook' }],
                    },
                ],
                webHooks: {
                    myHook: { reqUrl: 'https://example.com/webhook' },
                },
            };
            const result = ConfigSchema.parse(config);
            expect(result.checkInterval).toBe(60);
        });

        it('should reject empty notifyServices', () => {
            const config = { notifyServices: [] };
            expect(ConfigSchema.safeParse(config).success).toBe(false);
        });

        it('should reject reference to non-existent webhook', () => {
            const config = {
                notifyServices: [
                    {
                        image: 'nginx',
                        actions: [{ type: 'webHook', instance: 'nonExistent' }],
                    },
                ],
            };
            expect(ConfigSchema.safeParse(config).success).toBe(false);
        });

        it('should reject reference to non-existent SMTP server', () => {
            const config = {
                notifyServices: [
                    {
                        image: 'nginx',
                        actions: [
                            {
                                type: 'mailHook',
                                instance: 'nonExistent',
                                recipient: 'test@example.com',
                            },
                        ],
                    },
                ],
            };
            expect(ConfigSchema.safeParse(config).success).toBe(false);
        });

        it('should validate config with mail hook', () => {
            const config = {
                notifyServices: [
                    {
                        image: 'nginx',
                        actions: [
                            {
                                type: 'mailHook',
                                instance: 'generalMail',
                                recipient: 'admin@example.com',
                            },
                        ],
                    },
                ],
                smtpServer: {
                    generalMail: {
                        host: 'mail.example.com',
                        port: 587,
                        sendername: 'Docker Notify',
                        senderadress: 'notify@example.com',
                    },
                },
            };
            expect(ConfigSchema.safeParse(config).success).toBe(true);
        });
    });
});
