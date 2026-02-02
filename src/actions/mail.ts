import type { Transporter } from 'nodemailer';

import nodemailer from 'nodemailer';

import type { UpdateInfo, Config, Action, MailHookAction, SmtpServerConfig } from '../schema';
import type { ActionHandler, ActionContext } from './base';

const transporterCache = new Map<string, Transporter>();

function getTransporter(instanceName: string, smtpConfig: SmtpServerConfig): Transporter {
    const cached = transporterCache.get(instanceName);
    if (cached) {
        return cached;
    }

    const transporter = nodemailer.createTransport({
        pool: true,
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        auth:
            smtpConfig.username && smtpConfig.password
                ? {
                      user: smtpConfig.username,
                      pass: smtpConfig.password,
                  }
                : undefined,
    });

    transporterCache.set(instanceName, transporter);
    return transporter;
}

export const mailAction: ActionHandler = {
    type: 'mailHook',

    async execute(action: Action, updateInfo: UpdateInfo, context: ActionContext): Promise<void> {
        const mailAction = action as MailHookAction;
        const smtpConfig = context.config.smtpServer?.[mailAction.instance];

        if (!smtpConfig) {
            context.logger.error({ instance: mailAction.instance }, 'SMTP server configuration not found');
            return;
        }

        const transporter = getTransporter(mailAction.instance, smtpConfig);

        try {
            await transporter.verify();

            const mailOptions = {
                from: `"${smtpConfig.sendername}" <${smtpConfig.senderadress}>`,
                to: mailAction.recipient,
                subject: `Docker image '${updateInfo.imageName}' updated`,
                text: `Docker image '${updateInfo.imageName}' was updated:\n${updateInfo.imageUrl}`,
            };

            const info = await transporter.sendMail(mailOptions);
            context.logger.info(
                { messageId: info.messageId, recipient: mailAction.recipient },
                'Notification mail sent'
            );
        } catch (error) {
            context.logger.error({ error, instance: mailAction.instance }, 'Failed to send notification mail');
        }
    },

    validateInstance(action: Action, config: Config): boolean {
        if (action.type !== 'mailHook') return false;
        return config.smtpServer?.[action.instance] !== undefined;
    },
};

export function clearTransporterCache(): void {
    transporterCache.clear();
}
