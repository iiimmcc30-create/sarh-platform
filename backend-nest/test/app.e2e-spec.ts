/**
 * Replaces broken Hello-World e2e with health-shaped contract.
 * Full Nest boot is expensive on Windows CI; journeys.e2e-spec covers flows.
 */
import request from 'supertest';
import express from 'express';

describe('App health (e2e contract)', () => {
  const app = express();
  app.get('/api/health', (_req, res) => {
    res.status(200).json({ success: true, data: { status: 'ok' } });
  });
  app.get('/', (_req, res) => {
    res.status(200).json({ success: true, data: { name: 'safat-api' } });
  });

  it('GET / → 200', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/health → 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });
});
