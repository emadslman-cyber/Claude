import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireTenant, TenantRequest } from '../../middleware/tenant';
import {
  listCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer,
} from './customers.service';

const router = Router();
router.use(requireAuth);
router.use(requireTenant);

const CustomerSchema = z.object({
  name: z.string().min(1, 'الاسم مطلوب'),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  taxId: z.string().optional(),
  notes: z.string().optional(),
});

router.get('/', async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await listCustomers(req.companyId!));
  } catch (err) { next(err); }
});

router.get('/:id', async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await getCustomer(req.companyId!, req.params.id));
  } catch (err) { next(err); }
});

router.post('/', async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    const data = CustomerSchema.parse(req.body);
    res.status(201).json(await createCustomer(req.companyId!, data));
  } catch (err) { next(err); }
});

router.put('/:id', async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    const data = CustomerSchema.partial().parse(req.body);
    await updateCustomer(req.companyId!, req.params.id, data);
    res.json(await getCustomer(req.companyId!, req.params.id));
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    await deleteCustomer(req.companyId!, req.params.id);
    res.json({ message: 'تم الحذف' });
  } catch (err) { next(err); }
});

export default router;
