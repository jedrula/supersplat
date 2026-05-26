import { Vec3 } from 'playcanvas';

import { EditHistory } from './edit-history';
import { Events } from './events';
import { Pivot } from './pivot';

type AgentCommand =
    | { type: 'select_all' }
    | { type: 'delete_selection' }
    | { type: 'undo' }
    | { type: 'redo' }
    | { type: 'hide_selection' }
    | { type: 'unhide_all' }
    | { type: 'transform_selected', translate: [number, number, number] };

type AgentExecResult = {
    canUndo: boolean;
    canRedo: boolean;
};

type AgentApi = {
    exec: (cmd: AgentCommand) => Promise<AgentExecResult>;
};

declare global {
    interface Window {
        supersplat: AgentApi;
    }
}

const tmpTranslate = new Vec3();
const tmpPosition = new Vec3();

const isFiniteNumber = (value: number) => Number.isFinite(value);

const validateTranslate = (translate: [number, number, number]) => {
    if (!Array.isArray(translate) || translate.length !== 3 || !translate.every(isFiniteNumber)) {
        throw new Error('transform_selected requires translate: [x, y, z]');
    }
};

const flushQueue = async (events: Events) => {
    const queue = events.invoke('queue') as ((fn: () => void | Promise<void>) => Promise<void>) | undefined;
    if (queue) {
        await queue(() => {});
    }
};

const applyTranslateToSelection = async (events: Events, translate: [number, number, number]) => {
    const pivot = events.invoke('pivot') as Pivot;
    const selection = events.invoke('selection');

    if (!pivot || !selection) {
        throw new Error('transform_selected requires an active selection');
    }

    validateTranslate(translate);

    tmpTranslate.set(translate[0], translate[1], translate[2]);
    tmpPosition.copy(pivot.transform.position).add(tmpTranslate);

    pivot.start();
    pivot.moveTRS(tmpPosition, pivot.transform.rotation, pivot.transform.scale);
    pivot.end();

    await flushQueue(events);
};

const registerAgentApi = (events: Events, editHistory: EditHistory) => {
    window.supersplat = {
        async exec(cmd: AgentCommand) {
            switch (cmd.type) {
                case 'select_all':
                    events.fire('select.all');
                    await flushQueue(events);
                    break;

                case 'delete_selection':
                    events.fire('select.delete');
                    await flushQueue(events);
                    break;

                case 'hide_selection':
                    events.fire('select.hide');
                    await flushQueue(events);
                    break;

                case 'unhide_all':
                    events.fire('select.unhide');
                    await flushQueue(events);
                    break;

                case 'undo':
                    await editHistory.undo();
                    break;

                case 'redo':
                    await editHistory.redo();
                    break;

                case 'transform_selected':
                    await applyTranslateToSelection(events, cmd.translate);
                    break;

                default:
                    throw new Error(`unsupported command type: ${(cmd as { type: string }).type}`);
            }

            return {
                canUndo: editHistory.canUndo(),
                canRedo: editHistory.canRedo()
            };
        }
    };
};

export { registerAgentApi };
export type { AgentCommand, AgentExecResult, AgentApi };