import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireTenant, requireRole, TenantRequest } from '../../middleware/tenant';
import { listUsers, inviteUser, updateUserRole, removeUser } from './users.service';

const router = Router();

router.use(requireAuth);
router.use(requireTenant);

router.get('/', async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    const users = await listUsers(req.companyId!);
    res.json(users);
  } catch (err) {
    next(err);
  }
});

const InviteSchema = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
  role: z.enum(['ADMIN', 'ACCOUNTANT', 'STAFF']).default('STAFF'),
});

router.post(
  '/invite',
  requireRole('ADMIN'),
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const { email, role } = InviteSchema.parse(req.body);
      const member = await inviteUser(req.companyId!, email, role);
      res.status(201).json(member);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:id/role',
  requireRole('ADMIN'),
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const { role } = z.object({ role: z.enum(['ADMIN', 'ACCOUNTANT', 'STAFF']) }).parse(req.body);
      await updateUserRole(req.companyId!, req.params.id, role);
      res.json({ message: 'تم تحديث الصلاحية' });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/:id',
  requireRole('ADMIN'),
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      await removeUser(req.companyId!, req.params.id);
      res.json({ message: 'تم إزالة المستخدم' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
