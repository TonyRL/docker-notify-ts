import type { UpdateInfo, Config, Action } from '../schema';
import type { ActionHandler, ActionContext } from './base';

import { mailAction } from './mail';
import { webhookAction } from './webhook';

export class ActionRegistry {
    private handlers = new Map<string, ActionHandler>();

    constructor() {
        this.register(mailAction);
        this.register(webhookAction);
    }

    register(handler: ActionHandler): void {
        this.handlers.set(handler.type, handler);
    }

    getHandler(type: string): ActionHandler | undefined {
        return this.handlers.get(type);
    }

    getAllHandlers(): ActionHandler[] {
        return Array.from(this.handlers.values());
    }

    async executeAction(action: Action, updateInfo: UpdateInfo, context: ActionContext): Promise<void> {
        const handler = this.getHandler(action.type);

        if (!handler) {
            context.logger.error({ actionType: action.type }, 'Unknown action type, skipping');
            return;
        }

        await handler.execute(action, updateInfo, context);
    }

    validateAllActions(config: Config): boolean {
        for (const service of config.notifyServices) {
            for (const action of service.actions) {
                const handler = this.getHandler(action.type);
                if (!handler) {
                    return false;
                }
                if (!handler.validateInstance(action, config)) {
                    return false;
                }
            }
        }
        return true;
    }
}

export const actionRegistry = new ActionRegistry();

export type { ActionHandler, ActionContext } from './base';
