import { prisma } from '../../lib/prisma';

export async function listCustomers(companyId: string) {
  return prisma.customer.findMany({
    where: { companyId },
    orderBy: { name: 'asc' },
  });
}

export async function getCustomer(companyId: string, id: string) {
  return prisma.customer.findFirstOrThrow({ where: { id, companyId } });
}

export async function createCustomer(
  companyId: string,
  data: { name: string; phone?: string; email?: string; address?: string; taxId?: string; notes?: string }
) {
  return prisma.customer.create({ data: { ...data, companyId } });
}

export async function updateCustomer(
  companyId: string,
  id: string,
  data: { name?: string; phone?: string; email?: string; address?: string; taxId?: string; notes?: string }
) {
  return prisma.customer.updateMany({ where: { id, companyId }, data });
}

export async function deleteCustomer(companyId: string, id: string) {
  return prisma.customer.deleteMany({ where: { id, companyId } });
}
