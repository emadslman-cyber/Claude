import { prisma } from '../../lib/prisma';
import { Prisma } from '@prisma/client';

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  total: number;
}

export interface InvoiceInput {
  number: string;
  date: Date;
  dueDate?: Date;
  customerId?: string;
  customerName?: string;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  subtotal: number;
  taxAmount: number;
  discount: number;
  total: number;
  notes?: string;
  items: InvoiceItemInput[];
}

export async function listInvoices(companyId: string) {
  return prisma.invoice.findMany({
    where: { companyId },
    include: { items: true, customer: { select: { id: true, name: true } } },
    orderBy: { date: 'desc' },
  });
}

export async function getInvoice(companyId: string, id: string) {
  return prisma.invoice.findFirstOrThrow({
    where: { id, companyId },
    include: { items: true, customer: true },
  });
}

export async function createInvoice(companyId: string, input: InvoiceInput) {
  const { items, customerName: _cn, ...invoiceData } = input;
  return prisma.invoice.create({
    data: {
      ...invoiceData,
      companyId,
      subtotal: new Prisma.Decimal(invoiceData.subtotal),
      taxAmount: new Prisma.Decimal(invoiceData.taxAmount),
      discount: new Prisma.Decimal(invoiceData.discount),
      total: new Prisma.Decimal(invoiceData.total),
      items: {
        create: items.map((item) => ({
          description: item.description,
          quantity: new Prisma.Decimal(item.quantity),
          unitPrice: new Prisma.Decimal(item.unitPrice),
          taxRate: new Prisma.Decimal(item.taxRate),
          total: new Prisma.Decimal(item.total),
        })),
      },
    },
    include: { items: true },
  });
}

export async function updateInvoice(companyId: string, id: string, input: Partial<InvoiceInput>) {
  const { items, customerName: _cn, ...invoiceData } = input;

  const decimalFields: Record<string, Prisma.Decimal | undefined> = {};
  if (invoiceData.subtotal !== undefined) decimalFields.subtotal = new Prisma.Decimal(invoiceData.subtotal);
  if (invoiceData.taxAmount !== undefined) decimalFields.taxAmount = new Prisma.Decimal(invoiceData.taxAmount);
  if (invoiceData.discount !== undefined) decimalFields.discount = new Prisma.Decimal(invoiceData.discount);
  if (invoiceData.total !== undefined) decimalFields.total = new Prisma.Decimal(invoiceData.total);

  await prisma.$transaction(async (tx) => {
    await tx.invoice.updateMany({
      where: { id, companyId },
      data: { ...invoiceData, ...decimalFields },
    });

    if (items) {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceItem.createMany({
        data: items.map((item) => ({
          invoiceId: id,
          description: item.description,
          quantity: new Prisma.Decimal(item.quantity),
          unitPrice: new Prisma.Decimal(item.unitPrice),
          taxRate: new Prisma.Decimal(item.taxRate),
          total: new Prisma.Decimal(item.total),
        })),
      });
    }
  });

  return getInvoice(companyId, id);
}

export async function deleteInvoice(companyId: string, id: string) {
  return prisma.invoice.deleteMany({ where: { id, companyId } });
}

export async function updateEtaStatus(
  companyId: string,
  id: string,
  etaUuid: string,
  etaStatus: string
) {
  return prisma.invoice.updateMany({
    where: { id, companyId },
    data: { etaUuid, etaStatus },
  });
}
