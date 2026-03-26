import { Router } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();

router.post('/dev-admin-login', (req, res) => {
  const { login, password } = req.body;

  if (
    login !== process.env.ADMIN_LOGIN ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    {
      id: 'admin',
      role: 'admin',
    },
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
    {
      id: userId,
      role: 'user',
    },
    process.env.JWT_SECRET!,
    { expiresIn: '8h' }
  );

  res.json({ token });
});

router.post('/telegram', (req, res) => {
  // Guard against missing body (ensure JSON parsing worked) and accept fallback query params
  const body = req && typeof req.body === 'object' ? req.body : {};
  const initData = typeof body.initData === 'string' ? body.initData : '';
  let rawId: unknown = body.telegramId ?? body.telegram_id ?? body.userId ?? body.user_id ?? body.id ?? req.query?.telegramId ?? req.query?.telegram_id ?? req.query?.userId ?? req.query?.user_id ?? req.query?.id;

  if (rawId === undefined || rawId === null) {
    return res.status(400).json({ error: 'telegramId is required and must be provided in the request body or query string' });
  }

  if (!initData) {
    return res.status(400).json({ error: 'initData is required' });
  }

  // Normalize: accept numbers or numeric strings; trim strings
  if (typeof rawId === 'string') rawId = rawId.trim();

  if (rawId === '') {
    return res.status(400).json({ error: 'telegramId must not be empty' });
  }

  // Try numeric normalization first; fall back to string id
  const asNumber = Number(rawId as any);
  const normalizedId: number | string = Number.isFinite(asNumber) ? asNumber : String(rawId);

  // Ensure JWT secret is present
  if (!process.env.JWT_SECRET) {
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

  try {
    const token = jwt.sign(
      {
        id: String(normalizedId),
        role,
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    return res.json({ token, role });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to generate token' });
  }
});

import crypto from 'crypto';

router.post('/vk', (req, res) => {
  const body = req && typeof req.body === 'object' ? req.body : {};
  const { vkUserId, vkSign, allParams } = body;

  if (!vkUserId) {
    return res.status(400).json({ error: 'vkUserId is required' });
  }

  // Allow bypassing signature check in dev if secret is not set, 
  // but require it in production.
  const secret = process.env.VK_APP_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).json({ error: 'Server misconfiguration: VK_APP_SECRET not set' });
    }
    // In dev, just trust the vkUserId
    console.warn('[AUTH] VK_APP_SECRET not set, allowing VK login for dev purposes');
  } else if (vkSign && allParams) {
    try {
      // VK Signature validation logic
      // Sort query params that start with 'vk_'
      const signParams: Record<string, string> = {};
      const searchParams = new URLSearchParams(allParams);

      for (const [key, value] of searchParams.entries()) {
        if (key.startsWith('vk_')) {
          signParams[key] = value;
        }
      }

      const stringParams = Object.keys(signParams)
        .sort()
        .reduce((acc, key, idx) => {
          return acc + (idx === 0 ? '' : '&') + `${key}=${encodeURIComponent(signParams[key]!)}`;
        }, '');

      const paramsHash = crypto
        .createHmac('sha256', secret)
        .update(stringParams)
        .digest()
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=$/, '');

      if (paramsHash !== vkSign) {
        console.error(`[AUTH] VK Signature mismatch! expected=${paramsHash} received=${vkSign}`);
        return res.status(401).json({ error: 'Invalid VK signature' });
      }
      console.log(`[AUTH] VK Signature verified successfully for user ${vkUserId}`);
    } catch (e) {
      console.error('[AUTH] Error validating VK signature', e);
      return res.status(401).json({ error: 'Error validating VK signature' });
    }
  } else {
    console.warn(`[AUTH] VK login attempted without signature or params. vkSign=${!!vkSign} allParams=${!!allParams}`);
    if (secret) return res.status(401).json({ error: 'Missing VK signature parameters' });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: 'Server misconfiguration: JWT secret not set' });
  }

  // For now, VK users are 'user' roles. We could check against an ADMIN_VK_IDS env var if needed.
  const role = 'user';
  console.log(`[AUTH] vkUserId=${vkUserId} role=${role} platform=vk`);

  try {
    const token = jwt.sign(
      {
        id: String(vkUserId),
        role,
        platform: 'vk',
      },
      process.env.JWT_SECRET as string,
      { expiresIn: '12h' }
    );

    return res.json({ token, role });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to generate token' });
  }
});

export default router;
