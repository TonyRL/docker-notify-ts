import { z } from 'zod';

export const HttpMethodSchema = z.enum(['POST', 'GET', 'PUT', 'DELETE']);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

export const WebhookActionSchema = z.object({
    type: z.literal('webHook'),
    instance: z.string().min(1),
});

export const MailHookActionSchema = z.object({
    type: z.literal('mailHook'),
    instance: z.string().min(1),
    recipient: z.string().email(),
});

export const ActionSchema = z.discriminatedUnion('type', [WebhookActionSchema, MailHookActionSchema]);

export type Action = z.infer<typeof ActionSchema>;
export type WebhookAction = z.infer<typeof WebhookActionSchema>;
export type MailHookAction = z.infer<typeof MailHookActionSchema>;

export const NotifyServiceSchema = z.object({
    image: z.string().min(1),
    actions: z.array(ActionSchema).min(1),
});

export type NotifyService = z.infer<typeof NotifyServiceSchema>;

export const SmtpServerConfigSchema = z.object({
    host: z.string().min(1).default('127.0.0.1'),
    port: z.number().int().min(1).max(65535).default(25),
    secure: z.boolean().default(true),
    sendername: z.string().min(3),
    senderadress: z.string().email(),
    username: z.string().optional(),
    password: z.string().optional(),
});

export type SmtpServerConfig = z.infer<typeof SmtpServerConfigSchema>;

export const WebhookConfigSchema = z.object({
    reqUrl: z.string().url(),
    httpMethod: HttpMethodSchema.default('POST'),
    httpHeaders: z.union([z.record(z.string()), z.array(z.unknown()), z.string(), z.null()]).default(null),
    httpBody: z.union([z.record(z.unknown()), z.array(z.unknown()), z.string(), z.null()]).default(null),
});

export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;

export const ConfigSchema = z
    .object({
        dockerHubUsername: z.string().optional(),
        dockerHubPassword: z.string().optional(),
        checkInterval: z.number().int().positive().default(60),
        notifyServices: z.array(NotifyServiceSchema).min(1),
        smtpServer: z.record(SmtpServerConfigSchema).optional(),
        webHooks: z.record(WebhookConfigSchema).optional(),
    })
    .superRefine((config, ctx) => {
        for (const service of config.notifyServices) {
            for (const action of service.actions) {
                if (action.type === 'webHook') {
                    if (!config.webHooks?.[action.instance]) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            message: `Webhook instance '${action.instance}' is referenced but not defined in webHooks`,
                            path: ['webHooks', action.instance],
                        });
                    }
                } else if (action.type === 'mailHook') {
                    if (!config.smtpServer?.[action.instance]) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            message: `SMTP server instance '${action.instance}' is referenced but not defined in smtpServer`,
                            path: ['smtpServer', action.instance],
                        });
                    }
                }
            }
        }
    });

export type Config = z.infer<typeof ConfigSchema>;

export interface ParsedImage {
    user: string;
    name: string;
    tag?: string;
}

export interface ParsedNotifyService extends Omit<NotifyService, 'image'> {
    image: ParsedImage;
    originalImage: string;
}

export interface CacheEntry {
    user: string;
    name: string;
    lastUpdated: string;
    tag?: string;
}

export type CacheData = Record<string, CacheEntry>;

export interface RepositoryCheckResult {
    lastUpdated: string;
    name: string;
    user: string;
    tag: string | null;
    updated: boolean;
    job: ParsedNotifyService;
}

export interface UpdateInfo {
    imageName: string;
    imageUrl: string;
    lastUpdated: string;
}
