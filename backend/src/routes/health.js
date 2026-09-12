import { Router } from 'express';
import { pingDb } from '../lib/db.js';
import { asyncHandler } from '../lib/http.js';

const router = Router();

/**
 * GET /api/health
 * DB erisilemese bile 200 doner ve `db:false` bildirir — saglik ucu,
 * "servis ayakta mi" sorusunu yanitlar; bagimliligin durumu ayri alandir.
 */
router.get('/', asyncHandler(async (req, res) => {
  const db = await pingDb();
  res.json({
    ok: true,
    db,
    time: new Date().toISOString(),
  });
}));

export default router;
