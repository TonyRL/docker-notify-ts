import got from 'got';

import type { UpdateInfo, Config, Action, WebhookAction as WebhookActionType, WebhookConfig } from '../schema';
import type { ActionHandler, ActionContext } from './base';

function replaceMessagePlaceholders(body: WebhookConfig['httpBody'], message: string): WebhookConfig['httpBody'] {
    if (body === null || body === undefined) {
        return body;
    }

    if (typeof body === 'string') {
        return body.replace('$msg', message);
    }

    if (Array.isArray(body)) {
        return body.map((item) => (typeof item === 'string' ? item.replace('$msg', message) : item));
    }

    if (typeof body === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(body)) {
            if (typeof value === 'string') {
                result[key] = value.replace('$msg', message);
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    return body;
}

export const webhookAction: ActionHandler = {
    type: 'webHook',

    async execute(action: Action, updateInfo: UpdateInfo, context: ActionContext): Promise<void> {
        const webhookActionData = action as WebhookActionType;
        const webhookConfig = context.config.webHooks?.[webhookActionData.instance];

        if (!webhookConfig) {
            context.logger.error({ instance: webhookActionData.instance }, 'Webhook configuration not found');
            return;
        }

        const message = `Docker image '${updateInfo.imageName}' was updated:\n${updateInfo.imageUrl}`;
        const body = replaceMessagePlaceholders(webhookConfig.httpBody, message);

        try {
            const headers: Record<string, string> = {};
            if (
                webhookConfig.httpHeaders &&
                typeof webhookConfig.httpHeaders === 'object' &&
                !Array.isArray(webhookConfig.httpHeaders)
            ) {
                Object.assign(headers, webhookConfig.httpHeaders);
            }

            const response = await got(webhookConfig.reqUrl, {
                method: webhookConfig.httpMethod,
                headers,
                json: body && typeof body === 'object' ? body : undefined,
                body: body && typeof body === 'string' ? body : undefined,
            });

            context.logger.info(
                {
                    instance: webhookActionData.instance,
                    statusCode: response.statusCode,
                    image: updateInfo.imageName,
                },
                'Webhook executed successfully'
            );
        } catch (error) {
            context.logger.error({ error, instance: webhookActionData.instance }, 'Webhook execution failed');
        }
    },

    validateInstance(action: Action, config: Config): boolean {
        if (action.type !== 'webHook') return false;
        return config.webHooks?.[action.instance] !== undefined;
    },
};
