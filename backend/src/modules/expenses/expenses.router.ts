import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireTenant, TenantRequest } from '../../middleware/tenant';
import { listExpenses, createExpense, updateExpense, deleteExpense } from './expenses.service';

const router = Router();
router.use(requireAuth);
router.use(requireTenant);

const ExpenseSchema = z.object({
  date: z.string().transform((s) => new Date(s)),
  category: z.string().min(1, 'الفئة مطلوبة'),
  description: z.string().optional(),
  amount: z.number().positive('المبلغ يجب أن يكون موجباً'),
  vendor: z.string().optional(),
});

router.get('/', async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await listExpenses(req.companyId!));
  } catch (err) { next(err); }
});

router.post('/', async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    const data = ExpenseSchema.parse(req.body);
    res.status(201).json(await createExpense(req.companyId!, data));
  } catch (err) { next(err); }
});

router.put('/:id', async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    const data = ExpenseSchema.partial().parse(req.body);
    await updateExpense(req.companyId!, req.params.id, data);
    res.json({ message: 'تم التحديث' });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    await deleteExpense(req.companyId!, req.params.id);
    res.json({ message: 'تم الحذف' });
  } catch (err) { next(err); }
});

export default router;
