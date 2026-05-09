import { supabaseAdmin } from '../../lib/supabase';
import { prisma } from '../../lib/prisma';

export async function listUsers(companyId: string) {
  const members = await prisma.companyUser.findMany({
    where: { companyId },
    orderBy: { createdAt: 'asc' },
  });

  const userIds = members.map((m) => m.userId);
  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();

  const emailMap = new Map(
    (authUsers?.users ?? []).map((u) => [u.id, u.email])
  );

  return members.map((m) => ({
    id: m.id,
    userId: m.userId,
    email: emailMap.get(m.userId) ?? null,
    role: m.role,
    createdAt: m.createdAt,
  }));
}

export async function inviteUser(companyId: string, email: string, role: string) {
  const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
  let userId: string;

  const found = existing?.users.find((u) => u.email === email);
  if (found) {
    userId = found.id;
  } else {
    const tempPassword = Math.random().toString(36).slice(2) + 'A1!';
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw Object.assign(new Error(error?.message || 'فشل إنشاء المستخدم'), { statusCode: 400 });
    }
    userId = data.user.id;
  }

  const existing_membership = await prisma.companyUser.findUnique({
    where: { companyId_userId: { companyId, userId } },
  });

  if (existing_membership) {
    throw Object.assign(new Error('المستخدم موجود بالفعل في هذه الشركة'), { statusCode: 409 });
  }

  return prisma.companyUser.create({
    data: { companyId, userId, role: role as 'ADMIN' | 'ACCOUNTANT' | 'STAFF' },
  });
}

export async function updateUserRole(
  companyId: string,
  membershipId: string,
  role: string
) {
  return prisma.companyUser.updateMany({
    where: { id: membershipId, companyId },
    data: { role: role as 'ADMIN' | 'ACCOUNTANT' | 'STAFF' },
  });
}

export async function removeUser(companyId: string, membershipId: string) {
  return prisma.companyUser.deleteMany({
    where: { id: membershipId, companyId },
  });
}
