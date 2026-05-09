import { prisma } from '../../lib/prisma';

export async function getCompany(companyId: string) {
  return prisma.company.findUniqueOrThrow({ where: { id: companyId } });
}

export async function updateCompany(
  companyId: string,
  data: {
    name?: string;
    currency?: string;
    timezone?: string;
    taxId?: string;
    address?: string;
    phone?: string;
  }
) {
  return prisma.company.update({ where: { id: companyId }, data });
}
