import type { Logger } from '../logger';
import type { UpdateInfo, Config, Action } from '../schema';

export interface ActionContext {
    config: Config;
    logger: Logger;
}

export interface ActionHandler {
    readonly type: string;
    execute(action: Action, updateInfo: UpdateInfo, context: ActionContext): Promise<void>;
    validateInstance(action: Action, config: Config): boolean;
}
