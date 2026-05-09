import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireTenant, requireRole, TenantRequest } from '../../middleware/tenant';
import { getCompany, updateCompany } from './companies.service';

const router = Router();

router.use(requireAuth);
router.use(requireTenant);

router.get('/:id', async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    if (req.params.id !== req.companyId) {
      res.status(403).json({ error: 'غير مصرح' });
      return;
    }
    const company = await getCompany(req.companyId!);
    res.json(company);
  } catch (err) {
    next(err);
  }
});

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  currency: z.string().optional(),
  timezone: z.string().optional(),
  taxId: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
});

router.patch(
  '/:id',
  requireRole('ADMIN'),
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      if (req.params.id !== req.companyId) {
        res.status(403).json({ error: 'غير مصرح' });
        return;
      }
      const data = UpdateSchema.parse(req.body);
      const company = await updateCompany(req.companyId!, data);
      res.json(company);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
