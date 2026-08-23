import type { Request, Response, NextFunction } from 'express';
import { cloudEnabled } from '../../cloud/config.js';
import { applyPaddleWebhook, parsePaddleWebhook, verifyPaddleWebhookSignature } from '../../cloud/paddle.js';
import { HttpError } from '../../middleware/error.js';

/**
 * This handler receives the untouched Buffer from `express.raw`. Do not mount
 * it behind `express.json`: JSON re-serialization invalidates Paddle's HMAC.
 */
export async function paddleWebhookHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!cloudEnabled()) throw new HttpError(404, 'CLOUD_DISABLED', 'Not found.');
    if (!Buffer.isBuffer(req.body)) throw new HttpError(400, 'INVALID_WEBHOOK', 'Webhook body must be raw JSON.');
    const signature = req.header('paddle-signature');
    if (!verifyPaddleWebhookSignature(req.body, signature)) {
      throw new HttpError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Webhook signature could not be verified.');
    }
    const event = parsePaddleWebhook(req.body);
    if (!event) throw new HttpError(400, 'INVALID_WEBHOOK', 'Webhook payload is invalid.');
    const result = await applyPaddleWebhook(event);
    res.status(200).json({ ok: true, duplicate: result.duplicate });
  } catch (error) {
    next(error);
  }
}
