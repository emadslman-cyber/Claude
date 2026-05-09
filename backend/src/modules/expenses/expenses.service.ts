import { prisma } from '../../lib/prisma';

export async function listExpenses(companyId: string) {
  return prisma.expense.findMany({
    where: { companyId },
    orderBy: { date: 'desc' },
  });
}

export async function createExpense(
  companyId: string,
  data: { date: Date; category: string; description?: string; amount: number; vendor?: string }
) {
  return prisma.expense.create({ data: { ...data, companyId } });
}

export async function updateExpense(
  companyId: string,
  id: string,
  data: { date?: Date; category?: string; description?: string; amount?: number; vendor?: string }
) {
  return prisma.expense.updateMany({ where: { id, companyId }, data });
}

export async function deleteExpense(companyId: string, id: string) {
  return prisma.expense.deleteMany({ where: { id, companyId } });
}
