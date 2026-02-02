import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { UpdateInfo, Config, MailHookAction } from '../src/schema';

import { mailAction, clearTransporterCache } from '../src/actions/mail';
import { logger } from '../src/logger';

vi.mock('nodemailer', () => ({
    default: {
        createTransport: vi.fn(),
    },
}));

import nodemailer from 'nodemailer';

describe('mailAction', () => {
    const mockCreateTransport = vi.mocked(nodemailer.createTransport);
    let mockTransporter: {
        verify: ReturnType<typeof vi.fn>;
        sendMail: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        clearTransporterCache();
        mockTransporter = {
            verify: vi.fn().mockResolvedValue(true),
            sendMail: vi.fn().mockResolvedValue({ messageId: 'test-message-id' }),
        };
        mockCreateTransport.mockReturnValue(mockTransporter as any);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('type', () => {
        it('should have correct type', () => {
            expect(mailAction.type).toBe('mailHook');
        });
    });

    describe('execute', () => {
        it('should send email with correct parameters', async () => {
            const action: MailHookAction = {
                type: 'mailHook',
                instance: 'testSmtp',
                recipient: 'user@example.com',
            };
            const updateInfo: UpdateInfo = {
                imageName: 'nginx:latest',
                imageUrl: 'https://hub.docker.com/r/nginx/tags',
                lastUpdated: '2024-01-01',
            };
            const config: Config = {
                checkInterval: 60,
                notifyServices: [],
                smtpServer: {
                    testSmtp: {
                        host: 'mail.example.com',
                        port: 587,
                        secure: true,
                        sendername: 'Docker Notify',
                        senderadress: 'notify@example.com',
                        username: 'user',
                        password: 'pass',
                    },
                },
            };

            await mailAction.execute(action, updateInfo, { config, logger });

            expect(mockTransporter.verify).toHaveBeenCalled();
            expect(mockTransporter.sendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    from: '"Docker Notify" <notify@example.com>',
                    to: 'user@example.com',
                    subject: "Docker image 'nginx:latest' updated",
                    text: expect.stringContaining('nginx:latest'),
                })
            );
        });

        it('should reuse transporter for same instance', async () => {
            const action: MailHookAction = {
                type: 'mailHook',
                instance: 'testSmtp',
                recipient: 'user@example.com',
            };
            const updateInfo: UpdateInfo = {
                imageName: 'nginx',
                imageUrl: 'https://hub.docker.com/r/nginx/tags',
                lastUpdated: '2024-01-01',
            };
            const config: Config = {
                checkInterval: 60,
                notifyServices: [],
                smtpServer: {
                    testSmtp: {
                        host: 'mail.example.com',
                        port: 587,
                        secure: true,
                        sendername: 'Test',
                        senderadress: 'test@example.com',
                    },
                },
            };

            await mailAction.execute(action, updateInfo, { config, logger });
            await mailAction.execute(action, updateInfo, { config, logger });

            expect(mockCreateTransport).toHaveBeenCalledTimes(1);
        });

        it('should handle missing SMTP config', async () => {
            const action: MailHookAction = {
                type: 'mailHook',
                instance: 'nonExistent',
                recipient: 'user@example.com',
            };
            const updateInfo: UpdateInfo = {
                imageName: 'nginx',
                imageUrl: 'https://hub.docker.com/r/nginx/tags',
                lastUpdated: '2024-01-01',
            };
            const config: Config = { checkInterval: 60, notifyServices: [] };

            const loggerSpy = vi.spyOn(logger, 'error');
            await mailAction.execute(action, updateInfo, { config, logger });

            expect(loggerSpy).toHaveBeenCalledWith({ instance: 'nonExistent' }, 'SMTP server configuration not found');
            expect(mockCreateTransport).not.toHaveBeenCalled();
        });

        it('should handle mail send error', async () => {
            mockTransporter.sendMail.mockRejectedValue(new Error('SMTP error'));

            const action: MailHookAction = {
                type: 'mailHook',
                instance: 'testSmtp',
                recipient: 'user@example.com',
            };
            const updateInfo: UpdateInfo = {
                imageName: 'nginx',
                imageUrl: 'https://hub.docker.com/r/nginx/tags',
                lastUpdated: '2024-01-01',
            };
            const config: Config = {
                checkInterval: 60,
                notifyServices: [],
                smtpServer: {
                    testSmtp: {
                        host: 'mail.example.com',
                        port: 587,
                        secure: true,
                        sendername: 'Test',
                        senderadress: 'test@example.com',
                    },
                },
            };

            const loggerSpy = vi.spyOn(logger, 'error');
            await mailAction.execute(action, updateInfo, { config, logger });

            expect(loggerSpy).toHaveBeenCalledWith(
                expect.objectContaining({ instance: 'testSmtp' }),
                'Failed to send notification mail'
            );
        });
    });

    describe('validateInstance', () => {
        it('should return true for valid instance', () => {
            const action: MailHookAction = {
                type: 'mailHook',
                instance: 'mySmtp',
                recipient: 'test@test.com',
            };
            const config: Config = {
                checkInterval: 60,
                notifyServices: [],
                smtpServer: {
                    mySmtp: {
                        host: 'localhost',
                        port: 25,
                        secure: false,
                        sendername: 'Test',
                        senderadress: 'test@example.com',
                    },
                },
            };

            expect(mailAction.validateInstance(action, config)).toBe(true);
        });

        it('should return false for invalid instance', () => {
            const action: MailHookAction = {
                type: 'mailHook',
                instance: 'nonExistent',
                recipient: 'test@test.com',
            };
            const config: Config = { checkInterval: 60, notifyServices: [] };

            expect(mailAction.validateInstance(action, config)).toBe(false);
        });

        it('should return false for wrong action type', () => {
            const action = { type: 'webHook', instance: 'test' };
            const config: Config = { checkInterval: 60, notifyServices: [] };

            expect(mailAction.validateInstance(action, config)).toBe(false);
        });
    });
});
