import { Router, Request, Response } from 'express';
import { vkContactSessions, sendVkMessage } from '../services/vkService';
import { bot } from '../bot';

const router = Router();

/**
 * POST /vk/callback — VK Callback API webhook
 *
 * Handles:
 * - `confirmation`: returns VK_CONFIRMATION_CODE to verify the server
 * - `message_new`: incoming message from a VK user (admin or organizer replying to a contact request)
 *   → routes the reply back to the original user (via TG bot or VK)
 *
 * Setup in VK group settings:
 *   Управление → Работа с API → Callback API → URL: https://your-api.onrender.com/vk/callback
 *   Events: Сообщения → Входящие сообщения
 */
router.post('/callback', (req: Request, res: Response) => {
  const { type, object, secret } = req.body ?? {};

  // VK server confirmation handshake — MUST be handled BEFORE secret check
  // because VK does not send the secret field in confirmation requests
  if (type === 'confirmation') {
    const code = process.env.VK_CONFIRMATION_CODE;
    if (!code) {
      console.error('[vkWebhook] VK_CONFIRMATION_CODE is not set');
      return res.status(500).send('VK_CONFIRMATION_CODE not configured');
    }
    return res.send(code);
  }

  // Verify secret key for all other event types
  if (process.env.VK_CALLBACK_SECRET && secret !== process.env.VK_CALLBACK_SECRET) {
    return res.status(403).send('forbidden');
  }

  // Incoming message from a VK user
  if (type === 'message_new') {
    const msg = object?.message;
    const fromId: number = msg?.from_id;
    const text: string = msg?.text ?? '';

    // fromId > 0 means a real user (not a group/bot)
    if (fromId > 0 && text) {
      const session = vkContactSessions.get(fromId);
      if (session) {
        const replyText = `💬 Ответ от организаторов (VK):\n\n${text}`;

        if (session.tgUserId && bot) {
          // User is a Telegram user — send reply via TG bot
          bot.telegram
            .sendMessage(session.tgUserId, replyText)
            .catch((e) =>
              console.error('[vkWebhook] Failed to send TG reply to user', session.tgUserId, e)
            );
        } else if (session.vkUserId) {
          // User is a VK user — send reply via VK
          sendVkMessage(session.vkUserId, replyText).catch((e) =>
            console.error('[vkWebhook] Failed to send VK reply to user', session.vkUserId, e)
          );
        }
      }
    }
  }

  // VK expects 'ok' for all handled events
  return res.send('ok');
});

export default router;
