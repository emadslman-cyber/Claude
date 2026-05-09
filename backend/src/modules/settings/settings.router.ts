import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireTenant, TenantRequest } from '../../middleware/tenant';
import { prisma } from '../../lib/prisma';

const router = Router();
router.use(requireAuth);
router.use(requireTenant);

router.get('/:key', async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    const setting = await prisma.setting.findUnique({
      where: { companyId_key: { companyId: req.companyId!, key: req.params.key } },
    });
    res.json({ key: req.params.key, value: setting?.value ?? null });
  } catch (err) { next(err); }
});

router.get('/', async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    const settings = await prisma.setting.findMany({ where: { companyId: req.companyId! } });
    const map: Record<string, string> = {};
    settings.forEach((s) => { map[s.key] = s.value; });
    res.json(map);
  } catch (err) { next(err); }
});

router.put('/:key', async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    const { value } = z.object({ value: z.string() }).parse(req.body);
    await prisma.setting.upsert({
      where: { companyId_key: { companyId: req.companyId!, key: req.params.key } },
      create: { companyId: req.companyId!, key: req.params.key, value },
      update: { value },
    });
    res.json({ key: req.params.key, value });
  } catch (err) { next(err); }
});

export default router;
