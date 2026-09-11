/**
 * Flagged `/api/v1/productivity` command API. Writes go through commands;
 * reads attach `placeItem` placement. Does not replace `/nodes` or `/today`.
 */
import { Router } from 'express';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { repository } from '../../db/repository.js';
import { currentTimezone, todayIso } from '../../db/timezone.js';
import {
  executeProductivityCommand,
  PRODUCTIVITY_NOT_FOUND_MESSAGE,
  productivityNotFound,
} from '../../services/productivity/commands.js';
import { isProductivityEnabled } from '../../services/productivity/flag.js';
import { placeTask, taskReadModels, toTaskReadModel } from '../../services/productivity/read-models.js';

export const productivityRouter: Router = Router();

productivityRouter.use((req, _res, next) => {
  if (!isProductivityEnabled()) {
    next(new HttpError(404, 'NOT_FOUND', PRODUCTIVITY_NOT_FOUND_MESSAGE));
    return;
  }
  next();
});

function readClock(): { now: string; timeZone: string } {
  return { now: todayIso(), timeZone: currentTimezone() };
}

productivityRouter.get(
  '/tasks',
  asyncHandler(async (_req, res) => {
    const { now, timeZone } = readClock();
    const [nodes, edges] = await Promise.all([repository.allLiveNodes(), repository.allLiveEdges()]);
    res.json({ tasks: taskReadModels(nodes, edges, now, timeZone) });
  }),
);

productivityRouter.get(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    const node = await repository.getNode(req.params.id);
    if (!node || node.type !== 'task') productivityNotFound();
    const { now, timeZone } = readClock();
    const [nodes, edges] = await Promise.all([repository.allLiveNodes(), repository.edgesForNode(node.id)]);
    const nodesById = new Map(nodes.map((item) => [item.id, item]));
    res.json({ task: toTaskReadModel(node, placeTask(node, edges, nodesById, now, timeZone)) });
  }),
);

productivityRouter.get(
  '/waiting',
  asyncHandler(async (_req, res) => {
    const { now, timeZone } = readClock();
    const [nodes, edges] = await Promise.all([repository.allLiveNodes(), repository.allLiveEdges()]);
    const tasks = taskReadModels(nodes, edges, now, timeZone).filter((task) => task.status === 'waiting');
    res.json({ tasks });
  }),
);

productivityRouter.get(
  '/time-entries',
  asyncHandler(async (req, res) => {
    const taskId = typeof req.query.task_id === 'string' ? req.query.task_id.trim() : '';
    if (taskId) {
      const task = await repository.getNode(taskId);
      if (!task || task.type !== 'task') productivityNotFound();
    }
    const time_entries = await repository.listTimeEntries(taskId ? { taskId } : {});
    res.json({ time_entries });
  }),
);

productivityRouter.get(
  '/rules',
  asyncHandler(async (_req, res) => {
    res.json({ rules: await repository.listAutomationRules() });
  }),
);

productivityRouter.get(
  '/templates',
  asyncHandler(async (_req, res) => {
    res.json({ templates: await repository.listProductivityTemplates() });
  }),
);

productivityRouter.post(
  '/commands',
  asyncHandler(async (req, res) => {
    const outcome = await executeProductivityCommand(req.body, req.user?.email);
    res.status(outcome.replayed ? 200 : 201).json(outcome);
  }),
);
