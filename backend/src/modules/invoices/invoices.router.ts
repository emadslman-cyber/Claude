import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireTenant, TenantRequest } from '../../middleware/tenant';
import {
  listInvoices, getInvoice, createInvoice, updateInvoice,
  deleteInvoice, updateEtaStatus,
} from './invoices.service';

const router = Router();
router.use(requireAuth);
router.use(requireTenant);

const ItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  taxRate: z.number().nonnegative().default(0),
  total: z.number().nonnegative(),
});

const InvoiceSchema = z.object({
  number: z.string().min(1, 'رقم الفاتورة مطلوب'),
  date: z.string().transform((s) => new Date(s)),
  dueDate: z.string().transform((s) => new Date(s)).optional(),
  customerId: z.string().uuid().optional().or(z.literal('')),
  customerName: z.string().optional(),
  status: z.enum(['PENDING', 'PAID', 'CANCELLED']).default('PENDING'),
  subtotal: z.number().nonnegative(),
  taxAmount: z.number().nonnegative().default(0),
  discount: z.number().nonnegative().default(0),
  total: z.number().nonnegative(),
  notes: z.string().optional(),
  items: z.array(ItemSchema).min(1, 'يجب إضافة بند واحد على الأقل'),
});

router.get('/', async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await listInvoices(req.companyId!));
  } catch (err) { next(err); }
});

router.get('/:id', async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await getInvoice(req.companyId!, req.params.id));
  } catch (err) { next(err); }
});

router.post('/', async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    const data = InvoiceSchema.parse(req.body);
    res.status(201).json(await createInvoice(req.companyId!, data as any));
  } catch (err) { next(err); }
});

router.put('/:id', async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    const data = InvoiceSchema.partial().parse(req.body);
    res.json(await updateInvoice(req.companyId!, req.params.id, data as any));
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    await deleteInvoice(req.companyId!, req.params.id);
    res.json({ message: 'تم الحذف' });
  } catch (err) { next(err); }
});

router.patch('/:id/eta', async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    const { etaUuid, etaStatus } = z.object({
      etaUuid: z.string(),
      etaStatus: z.string(),
    }).parse(req.body);
    await updateEtaStatus(req.companyId!, req.params.id, etaUuid, etaStatus);
    res.json({ message: 'تم التحديث' });
  } catch (err) { next(err); }
});

export default router;
