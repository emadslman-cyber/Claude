import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../lib/supabase';
import { requireAuth, AuthRequest } from '../../middleware/auth';
import { registerCompany, getUserProfile } from './auth.service';

const router = Router();

const RegisterSchema = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
  password: z.string().min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'),
  companyName: z.string().min(2, 'اسم الشركة مطلوب'),
});

router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, companyName } = RegisterSchema.parse(req.body);
    const result = await registerCompany(email, password, companyName);
    res.status(201).json({
      message: 'تم إنشاء الحساب بنجاح',
      company: { id: result.company.id, name: result.company.name },
    });
  } catch (err) {
    next(err);
  }
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = LoginSchema.parse(req.body);
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      res.status(401).json({ error: 'بريد إلكتروني أو كلمة مرور غير صحيحة' });
      return;
    }

    res.json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
      user: { id: data.user.id, email: data.user.email },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
    const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data.session) {
      res.status(401).json({ error: 'تعذّر تجديد الجلسة' });
      return;
    }

    res.json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const profile = await getUserProfile(req.userId!);
    res.json({ userId: req.userId, email: req.userEmail, ...profile });
  } catch (err) {
    next(err);
  }
});

export default router;
