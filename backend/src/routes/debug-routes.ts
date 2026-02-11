/**
 * Temporary debug endpoints — NO auth.
 * Remove before production.
 */
import { Router } from 'express';
import { supabase } from '../supabaseClient';

const router = Router();

router.get('/raw-bookings', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*');

    if (error) {
      console.error('[RAW ERROR]', error);
      return res.status(500).json({ error });
    }

    return res.json({
      count: data?.length || 0,
      data
    });
  } catch (err) {
    console.error('[RAW CATCH]', err);
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
