/**
 * API integration-style tests with mocked Nest handlers.
 * Validates status codes and response envelopes without booting full AppModule.
 */
import request from 'supertest';
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from 'express';

function createMockApi(): Express {
  const app = express();
  app.use(express.json());

  const authed = (req: Request, res: Response, next: NextFunction) => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'unauthorized',
        messageAr: 'غير مصرح',
      });
    }
    if (h === 'Bearer forbidden') {
      return res.status(403).json({
        success: false,
        error: 'forbidden',
        messageAr: 'ممنوع',
      });
    }
    next();
  };

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ success: true, data: { status: 'ok' } });
  });

  app.post('/api/auth/login', (req, res) => {
    if (!req.body?.login || !req.body?.password) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        messageAr: 'بيانات غير صحيحة',
      });
    }
    if (req.body.password === 'wrong') {
      return res.status(401).json({
        success: false,
        error: 'invalid_credentials',
        messageAr: 'بيانات الدخول غير صحيحة',
      });
    }
    return res.status(200).json({
      success: true,
      data: { accessToken: 'tok', refreshToken: 'ref' },
    });
  });

  app.post('/api/auth/register', (req, res) => {
    if (!req.body?.username) {
      return res.status(422).json({
        success: false,
        error: 'validation_error',
        messageAr: 'اسم المستخدم مطلوب',
      });
    }
    return res.status(201).json({ success: true, data: { id: 'u1' } });
  });

  app.get('/api/users/:id', authed, (req, res) => {
    if (req.params.id === 'missing') {
      return res.status(404).json({
        success: false,
        error: 'not_found',
        messageAr: 'المستخدم غير موجود',
      });
    }
    return res.status(200).json({ success: true, data: { id: req.params.id } });
  });

  app.post('/api/listings', authed, (req, res) => {
    if (!req.body?.title || !Array.isArray(req.body?.images)) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        messageAr: 'بيانات الإعلان غير مكتملة',
      });
    }
    return res.status(201).json({
      success: true,
      data: {
        id: 'l1',
        featured: !!req.body.featured,
        pinned: !!req.body.pinned,
      },
    });
  });

  app.put('/api/listings/:id', authed, (req, res) => {
    if (req.headers.authorization === 'Bearer forbidden') {
      return res
        .status(403)
        .json({ success: false, error: 'forbidden', messageAr: 'ممنوع' });
    }
    return res.status(200).json({ success: true, data: { id: req.params.id } });
  });

  app.delete('/api/listings/:id', authed, (req, res) => {
    if (req.params.id === 'missing') {
      return res
        .status(404)
        .json({ success: false, error: 'not_found', messageAr: 'غير موجود' });
    }
    return res.status(200).json({ success: true, data: { deleted: true } });
  });

  app.post('/api/payments/:id/sync', authed, (req, res) => {
    const id = req.params.id;
    if (id === 'rate') {
      return res.status(429).json({
        error: 'too_many_requests',
        messageAr: 'طلبات كثيرة',
        retryAfter: 10,
      });
    }
    if (id === 'boom') {
      return res.status(500).json({
        success: false,
        error: 'server_error',
        messageAr: 'خطأ في الخادم',
      });
    }
    if (id === 'paid') {
      return res.status(200).json({
        success: true,
        data: { outcome: 'success', status: 'paid' },
      });
    }
    if (id === 'cancelled') {
      return res.status(200).json({
        success: true,
        data: { outcome: 'failed', status: 'failed' },
      });
    }
    return res.status(200).json({
      success: true,
      data: { outcome: 'processing', status: 'pending' },
    });
  });

  app.post('/api/butchers/orders/:id/status', authed, (req, res) => {
    const next = req.body?.status;
    if (
      !['confirmed', 'cancelled', 'delivered', 'preparing', 'ready'].includes(
        next,
      )
    ) {
      return res.status(400).json({
        success: false,
        error: 'invalid_transition',
        messageAr: 'انتقال غير مسموح',
      });
    }
    return res.status(200).json({ success: true, data: { status: next } });
  });

  app.get('/api/admin/users', authed, (req, res) => {
    if (req.headers.authorization !== 'Bearer admin') {
      return res.status(403).json({
        success: false,
        error: 'forbidden',
        messageAr: 'صلاحيات غير كافية',
      });
    }
    return res.status(200).json({ success: true, data: { users: [] } });
  });

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: 'not_found',
      messageAr: 'المسار غير موجود',
    });
  });

  return app;
}

describe('API integration (mock server) — status matrix', () => {
  const app = createMockApi();

  it('GET /api/health → 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/auth/login validation → 400', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/auth/login wrong password → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ login: 'a', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/login success → 200', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ login: 'a', password: 'ok' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('POST /api/auth/register missing username → 422', async () => {
    const res = await request(app).post('/api/auth/register').send({});
    expect(res.status).toBe(422);
  });

  it('POST /api/auth/register success → 201', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'user1' });
    expect(res.status).toBe(201);
  });

  it('GET /api/users/:id without token → 401', async () => {
    const res = await request(app).get('/api/users/u1');
    expect(res.status).toBe(401);
  });

  it('GET /api/users/missing → 404', async () => {
    const res = await request(app)
      .get('/api/users/missing')
      .set('Authorization', 'Bearer tok');
    expect(res.status).toBe(404);
  });

  it('POST /api/listings without auth → 401', async () => {
    const res = await request(app).post('/api/listings').send({});
    expect(res.status).toBe(401);
  });

  it('POST /api/listings invalid → 400', async () => {
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', 'Bearer tok')
      .send({ title: 'x' });
    expect(res.status).toBe(400);
  });

  it('POST /api/listings success → 201', async () => {
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', 'Bearer tok')
      .send({ title: 'إعلان', images: ['https://x/a.jpg'], pinned: true });
    expect(res.status).toBe(201);
    expect(res.body.data.pinned).toBe(true);
  });

  it('PUT /api/listings/:id forbidden → 403', async () => {
    const res = await request(app)
      .put('/api/listings/l1')
      .set('Authorization', 'Bearer forbidden')
      .send({ title: 'x' });
    expect(res.status).toBe(403);
  });

  it('DELETE /api/listings/missing → 404', async () => {
    const res = await request(app)
      .delete('/api/listings/missing')
      .set('Authorization', 'Bearer tok');
    expect(res.status).toBe(404);
  });

  it('POST payment sync paid → 200 success', async () => {
    const res = await request(app)
      .post('/api/payments/paid/sync')
      .set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body.data.outcome).toBe('success');
  });

  it('POST payment sync cancelled → failed outcome (no fulfill)', async () => {
    const res = await request(app)
      .post('/api/payments/cancelled/sync')
      .set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body.data.outcome).toBe('failed');
  });

  it('POST payment sync rate limited → 429', async () => {
    const res = await request(app)
      .post('/api/payments/rate/sync')
      .set('Authorization', 'Bearer tok');
    expect(res.status).toBe(429);
  });

  it('POST payment sync server error → 500', async () => {
    const res = await request(app)
      .post('/api/payments/boom/sync')
      .set('Authorization', 'Bearer tok');
    expect(res.status).toBe(500);
  });

  it('order status invalid → 400', async () => {
    const res = await request(app)
      .post('/api/butchers/orders/o1/status')
      .set('Authorization', 'Bearer tok')
      .send({ status: 'delivered_from_pending' });
    expect(res.status).toBe(400);
  });

  it('admin without role → 403', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', 'Bearer tok');
    expect(res.status).toBe(403);
  });

  it('admin with role → 200', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', 'Bearer admin');
    expect(res.status).toBe(200);
  });

  it('unknown route → 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
  });
});
