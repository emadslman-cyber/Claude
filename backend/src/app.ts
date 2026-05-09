import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler, notFound } from './middleware/error';

import authRouter from './modules/auth/auth.router';
import companiesRouter from './modules/companies/companies.router';
import usersRouter from './modules/users/users.router';
import customersRouter from './modules/customers/customers.router';
import invoicesRouter from './modules/invoices/invoices.router';
import expensesRouter from './modules/expenses/expenses.router';
import settingsRouter from './modules/settings/settings.router';
import etaRouter from './modules/eta/eta.router';

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_ORIGIN || 'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'null',
];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'mohaseb-backend' }));

app.use('/api/auth', authRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/users', usersRouter);
app.use('/api/customers', customersRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/settings', settingsRouter);
app.use('/eta', etaRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
