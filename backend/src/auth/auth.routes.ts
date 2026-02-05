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
  const { telegramId } = req.body;

  if (!telegramId) {
    return res.status(400).json({ error: 'telegramId is required' });
  }

  const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '')
    .split(',')
    .map((id) => id.trim());

  const role = adminIds.includes(String(telegramId))
    ? 'admin'
    : 'user';

  const token = jwt.sign(
    {
      id: String(telegramId),
      role,
    },
    process.env.JWT_SECRET!,
    { expiresIn: '12h' }
  );

  res.json({ token, role });
});



export default router;
