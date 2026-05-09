import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../lib/prisma';

export interface TenantRequest extends AuthRequest {
  companyId?: string;
  userRole?: string;
}

export async function requireTenant(
  req: TenantRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const companyId = req.headers['x-company-id'] as string;

  if (!companyId) {
    res.status(400).json({ error: 'مطلوب تحديد الشركة (X-Company-Id)' });
    return;
  }

  const membership = await prisma.companyUser.findUnique({
    where: { companyId_userId: { companyId, userId: req.userId! } },
  });

  if (!membership) {
    res.status(403).json({ error: 'غير مصرح لك بالوصول لهذه الشركة' });
    return;
  }

  req.companyId = companyId;
  req.userRole = membership.role;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: TenantRequest, res: Response, next: NextFunction): void => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      res.status(403).json({ error: 'صلاحيات غير كافية' });
      return;
    }
    next();
  };
}
