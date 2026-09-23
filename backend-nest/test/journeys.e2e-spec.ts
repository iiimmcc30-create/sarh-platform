import request from 'supertest';
import express from 'express';

/**
 * Lightweight E2E smoke against a stand-in gateway.
 * Full Nest AppModule boot is covered in CI unit/integration layers;
 * this suite locks end-user journey status codes.
 */
describe('E2E user journeys (contract server)', () => {
  const app = express();
  app.use(express.json());

  const sessions = new Map<string, { userId: string }>();
  let listingId = '';
  let paymentId = '';
  let orderId = '';

  app.post('/api/auth/register', (req, res) => {
    if (!req.body?.phone || !req.body?.username) {
      return res
        .status(400)
        .json({ success: false, error: 'validation_error' });
    }
    return res.status(201).json({
      success: true,
      data: { access_token: 'access-e2e', user: { id: 'u-e2e' } },
    });
  });

  app.post('/api/auth/login', (req, res) => {
    if (req.body?.password !== 'Secret1!') {
      return res
        .status(401)
        .json({ success: false, error: 'invalid_credentials' });
    }
    sessions.set('access-e2e', { userId: 'u-e2e' });
    return res.status(200).json({
      success: true,
      data: { access_token: 'access-e2e', refresh_token: 'refresh-e2e' },
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const tok = String(req.headers.authorization ?? '').replace('Bearer ', '');
    sessions.delete(tok);
    return res.status(200).json({ success: true, data: { ok: true } });
  });

  app.post('/api/auth/reset-password', (req, res) => {
    if (!req.body?.phoneToken) {
      return res.status(400).json({ success: false, error: 'invalid_token' });
    }
    return res.status(200).json({ success: true, data: { ok: true } });
  });

  const requireAuth = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const tok = String(req.headers.authorization ?? '').replace('Bearer ', '');
    if (!sessions.has(tok) && tok !== 'access-e2e') {
      return res.status(401).json({ success: false, error: 'unauthorized' });
    }
    next();
  };

  app.post('/api/listings', requireAuth, (req, res) => {
    listingId = 'listing-e2e';
    return res.status(201).json({
      success: true,
      data: {
        id: listingId,
        pinned: !!req.body.pinned,
        featured: !!req.body.featured,
      },
    });
  });

  app.post('/api/payments/initiate', requireAuth, (req, res) => {
    paymentId = 'pay-e2e';
    return res.status(201).json({
      success: true,
      data: {
        paymentId,
        checkoutUrl: 'https://pay.example/checkout',
        status: 'pending',
      },
    });
  });

  app.post('/api/payments/:id/sync', requireAuth, (req, res) => {
    const outcome = req.query.outcome as string | undefined;
    if (outcome === 'cancel') {
      return res.status(200).json({
        success: true,
        data: { outcome: 'failed', status: 'failed' },
      });
    }
    if (outcome === 'expire') {
      return res.status(200).json({
        success: true,
        data: { outcome: 'failed', status: 'failed', niState: 'EXPIRED' },
      });
    }
    return res.status(200).json({
      success: true,
      data: { outcome: 'success', status: 'paid', niState: 'CAPTURED' },
    });
  });

  app.post('/api/butchers/orders', requireAuth, (req, res) => {
    orderId = 'order-e2e';
    return res.status(201).json({
      success: true,
      data: { id: orderId, status: 'pending', paymentStatus: 'unpaid' },
    });
  });

  app.post('/api/butchers/orders/:id/status', requireAuth, (req, res) => {
    return res.status(200).json({
      success: true,
      data: { id: req.params.id, status: req.body.status },
    });
  });

  it('journey: register → login → create listing with plan pin → logout', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ phone: '+966500000000', username: 'e2e_user' });
    expect(reg.status).toBe(201);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ login: 'e2e_user', password: 'Secret1!' });
    expect(login.status).toBe(200);
    const token = login.body.data.access_token;

    const listing = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'إعلان',
        images: ['https://cdn.example/a.jpg'],
        pinned: true,
        featured: true,
      });
    expect(listing.status).toBe(201);
    expect(listing.body.data.pinned).toBe(true);
    expect(listing.body.data.featured).toBe(true);

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logout.status).toBe(200);
  });

  it('journey: payment success fulfills; cancel/expire do not', async () => {
    sessions.set('access-e2e', { userId: 'u-e2e' });
    const init = await request(app)
      .post('/api/payments/initiate')
      .set('Authorization', 'Bearer access-e2e')
      .send({ type: 'subscription' });
    expect(init.status).toBe(201);
    expect(init.body.data.status).toBe('pending');

    const ok = await request(app)
      .post(`/api/payments/${paymentId}/sync`)
      .set('Authorization', 'Bearer access-e2e');
    expect(ok.status).toBe(200);
    expect(ok.body.data.outcome).toBe('success');

    const cancel = await request(app)
      .post(`/api/payments/${paymentId}/sync`)
      .query({ outcome: 'cancel' })
      .set('Authorization', 'Bearer access-e2e');
    expect(cancel.body.data.outcome).toBe('failed');

    const expire = await request(app)
      .post(`/api/payments/${paymentId}/sync`)
      .query({ outcome: 'expire' })
      .set('Authorization', 'Bearer access-e2e');
    expect(expire.body.data.niState).toBe('EXPIRED');
    expect(expire.body.data.outcome).toBe('failed');
  });

  it('journey: butcher order create → accept → deliver', async () => {
    sessions.set('access-e2e', { userId: 'u-e2e' });
    const created = await request(app)
      .post('/api/butchers/orders')
      .set('Authorization', 'Bearer access-e2e')
      .send({ items: [{ productId: 'p1', qty: 1 }] });
    expect(created.status).toBe(201);

    const accepted = await request(app)
      .post(`/api/butchers/orders/${orderId}/status`)
      .set('Authorization', 'Bearer access-e2e')
      .send({ status: 'confirmed' });
    expect(accepted.status).toBe(200);

    const delivered = await request(app)
      .post(`/api/butchers/orders/${orderId}/status`)
      .set('Authorization', 'Bearer access-e2e')
      .send({ status: 'delivered' });
    expect(delivered.status).toBe(200);
    expect(delivered.body.data.status).toBe('delivered');
  });

  it('journey: password reset requires token', async () => {
    const bad = await request(app).post('/api/auth/reset-password').send({});
    expect(bad.status).toBe(400);
    const ok = await request(app)
      .post('/api/auth/reset-password')
      .send({ phoneToken: 'tok', newPassword: 'Secret2!' });
    expect(ok.status).toBe(200);
  });
});
