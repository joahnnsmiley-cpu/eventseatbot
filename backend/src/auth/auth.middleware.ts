import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface UserPayload {
  id?: string | number;
  sub?: string | number;
  userId?: string | number;
  role?: string;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

export interface AuthRequest extends Request {
  user?: UserPayload;
}

export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const urlPath = typeof req.originalUrl === 'string' && req.originalUrl.length
    ? req.originalUrl
    : req.path || '';
  if (urlPath.startsWith('/public') || urlPath.startsWith('/events')) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (typeof authHeader !== 'string' || !authHeader.length) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const [scheme, token] = authHeader.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    return res.status(401).json({ error: 'Invalid authorization header' });
  }

  // Development/test bypass: allow a simple bearer token to act as admin when
  // NODE_ENV !== 'production'. This enables backend-only tests to run without
  // configuring a JWT_SECRET. The bypass token can be set via
  // `ADMIN_BYPASS_TOKEN` env var; default value for tests is 'TEST_ADMIN_BYPASS'.
  const bypassToken = process.env.ADMIN_BYPASS_TOKEN || 'TEST_ADMIN_BYPASS';
  if (process.env.NODE_ENV !== 'production' && token === bypassToken) {
    req.user = { role: 'admin', id: 'admin' } as UserPayload;
    return next();
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'JWT_SECRET not configured' });
  }

  try {
    const payload = jwt.verify(token, secret) as UserPayload;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
