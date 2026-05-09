import { supabaseAdmin } from '../../lib/supabase';
import { prisma } from '../../lib/prisma';

export async function registerCompany(
  email: string,
  password: string,
  companyName: string
) {
  const slug = companyName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 50) + '-' + Date.now();

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    throw Object.assign(new Error(authError?.message || 'فشل إنشاء المستخدم'), { statusCode: 400 });
  }

  const company = await prisma.company.create({
    data: {
      name: companyName,
      slug,
      companyUsers: {
        create: { userId: authData.user.id, role: 'ADMIN' },
      },
    },
  });

  return { user: authData.user, company };
}

export async function getUserProfile(userId: string) {
  const memberships = await prisma.companyUser.findMany({
    where: { userId },
    include: { company: true },
  });

  return {
    companies: memberships.map((m) => ({
      id: m.company.id,
      name: m.company.name,
      slug: m.company.slug,
      role: m.role,
    })),
  };
}
