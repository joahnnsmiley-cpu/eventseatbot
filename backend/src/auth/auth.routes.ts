import { Router } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { isUserController } from '../db-postgres';

const router = Router();

// Dev-only endpoints — disabled in production
if (process.env.NODE_ENV !== 'production') {
  router.post('/dev-admin-login', (req, res) => {
    const { login, password } = req.body;

    if (
      login !== process.env.ADMIN_LOGIN ||
      password !== process.env.ADMIN_PASSWORD
    ) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: 'admin', role: 'admin' },
      process.env.JWT_SECRET!,
      { expiresIn: '8h' }
    );

    res.json({ token });
  });

  router.post('/dev-user-login', (req, res) => {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const token = jwt.sign(
      { id: userId, role: 'user' },
      process.env.JWT_SECRET!,
      { expiresIn: '8h' }
    );

    res.json({ token });
  });
}

router.post('/telegram', async (req, res) => {
  console.log('[AUTH] Telegram login attempt received');
  const body = req && typeof req.body === 'object' ? req.body : {};
  const initData = typeof body.initData === 'string' ? body.initData : '';
  let rawId: unknown = body.telegramId ?? body.telegram_id ?? body.userId ?? body.user_id ?? body.id ?? req.query?.telegramId ?? req.query?.telegram_id ?? req.query?.userId ?? req.query?.user_id ?? req.query?.id;

  if (rawId === undefined || rawId === null) {
    console.warn('[AUTH] Telegram login failed: telegramId missing');
    return res.status(400).json({ error: 'telegramId is required' });
  }

  if (!initData) {
    console.warn('[AUTH] Telegram login failed: initData missing');
    return res.status(400).json({ error: 'initData is required' });
  }

  // HMAC verification (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('[AUTH] Telegram login failed: TELEGRAM_BOT_TOKEN not set');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash) {
    console.warn('[AUTH] Telegram login failed: hash missing in initData');
    return res.status(401).json({ error: 'Invalid initData: missing hash' });
  }
  params.delete('hash');
  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

  let hashValid = false;
  try {
    hashValid = crypto.timingSafeEqual(
      Buffer.from(receivedHash, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );
  } catch {
    hashValid = false;
  }
  if (!hashValid) {
    console.warn('[AUTH] Telegram login failed: invalid initData signature');
    return res.status(401).json({ error: 'Invalid initData signature' });
  }

  if (typeof rawId === 'string') rawId = rawId.trim();
  if (rawId === '') {
    return res.status(400).json({ error: 'telegramId must not be empty' });
  }

  const asNumber = Number(rawId as any);
  const normalizedId: number | string = Number.isFinite(asNumber) ? asNumber : String(rawId);

  if (!process.env.JWT_SECRET) {
    console.error('[AUTH] Telegram login failed: JWT_SECRET not set');
    return res.status(500).json({ error: 'Server misconfiguration: JWT secret not set' });
  }

  const adminIds = (process.env.ADMINS_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  const role = adminIds.includes(String(normalizedId)) ? 'admin' : 'user';
  const username = typeof body.username === 'string'
    ? body.username.trim()
    : typeof body.telegramUsername === 'string'
      ? body.telegramUsername.trim()
      : typeof body.telegram_username === 'string'
        ? body.telegram_username.trim()
        : '';
  const telegramIdValue = Number.isFinite(asNumber) ? asNumber : String(normalizedId);
  console.log(`[AUTH] telegramId=${telegramIdValue} username=${username || '-'} role=${role}`);

  let isController = false;
  try { isController = await isUserController(normalizedId); } catch { /* non-fatal */ }

  try {
    const token = jwt.sign(
      { id: String(normalizedId), role, isController },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );
    return res.json({ token, role });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to generate token' });
  }
});

router.post('/vk', async (req, res) => {
  const body = req && typeof req.body === 'object' ? req.body : {};

  const vkSign = String(body.vkSign || '');
  const allParams = String(body.allParams || '');

  const secret = process.env.VK_APP_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).json({ error: 'Server misconfiguration: VK_APP_SECRET not set' });
    }
    // Dev fallback: allow without signature but require explicit vkUserId
    const fallbackUserId = String(body.vkUserId || '');
    if (!fallbackUserId) return res.status(400).json({ error: 'vkUserId is required' });
    console.warn('[AUTH] VK_APP_SECRET not set, allowing VK login for dev purposes');
    return issueVkToken(res, fallbackUserId);
  }

  if (!vkSign || !allParams) {
    return res.status(401).json({ error: 'Missing VK signature parameters' });
  }

  try {
    const trimmedSecret = secret.trim();
    const signParams: Record<string, string> = {};
    const pairs = allParams.split('&');

    for (const pair of pairs) {
      const firstEqualIndex = pair.indexOf('=');
      if (firstEqualIndex === -1) continue;
      const key = pair.substring(0, firstEqualIndex);
      const value = pair.substring(firstEqualIndex + 1);
      if (key && key.startsWith('vk_') && key !== 'vk_sign') {
        signParams[key] = value || '';
      }
    }

    const stringParams = Object.keys(signParams).sort().map((k) => `${k}=${signParams[k]}`).join('&');
    const paramsHash = crypto
      .createHmac('sha256', trimmedSecret)
      .update(stringParams)
      .digest()
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=$/, '');

    // Timing-safe comparison to prevent timing attacks
    let signatureValid = false;
    try {
      signatureValid = crypto.timingSafeEqual(
        Buffer.from(paramsHash),
        Buffer.from(vkSign)
      );
    } catch {
      signatureValid = false;
    }

    if (!signatureValid) {
      console.error(`[AUTH] VK Signature mismatch`);
      return res.status(401).json({ error: 'Invalid VK signature' });
    }

    // Extract user ID from verified params (not from body)
    const verifiedUserId = signParams['vk_user_id'];
    if (!verifiedUserId) {
      return res.status(401).json({ error: 'No vk_user_id in verified params' });
    }

    console.log(`[AUTH] VK Signature verified successfully for user ${verifiedUserId}`);
    return issueVkToken(res, verifiedUserId);
  } catch (e) {
    console.error('[AUTH] Error validating VK signature', e);
    return res.status(401).json({ error: 'Error validating VK signature' });
  }
});

async function issueVkToken(res: any, userId: string) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error('[AUTH] ERROR: JWT_SECRET not set');
    return res.status(500).json({ error: 'Server misconfiguration: JWT secret not set' });
  }

  const telegramAdmins = (process.env.ADMINS_IDS || '').split(',').map((id) => id.trim());
  const vkAdmins = (process.env.VK_ADMINS_IDS || '').split(',').map((id) => id.trim());
  const role = (vkAdmins.includes(userId) || telegramAdmins.includes(userId)) ? 'admin' : 'user';

  console.log(`[AUTH] Success: vkUserId=${userId} role=${role} platform=vk`);

  let isControllerVk = false;
  try { isControllerVk = await isUserController(userId); } catch { /* non-fatal */ }

  try {
    const token = jwt.sign(
      { id: userId, role, platform: 'vk', isController: isControllerVk },
      jwtSecret,
      { expiresIn: '12h' }
    );
    return res.json({ token, role });
  } catch (err) {
    console.error('[AUTH] Token generation error:', err);
    return res.status(500).json({ error: 'Failed to generate token' });
  }
}

export default router;
