import request from 'supertest';
import express from 'express';

jest.mock('../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    if (req.headers.authorization === 'Bearer test-token') {
      req.user = { id: 'user-1', role: 'user' };
      return next();
    }
    return _res.status(401).json({ error: 'Unauthorized' });
  },
}));

jest.mock('../services/dispute.service', () => ({
  createDispute: jest.fn(),
  escalateDispute: jest.fn(),
  resolveDispute: jest.fn(),
  withdrawDispute: jest.fn(),
}));

import * as disputeService from '../services/dispute.service';
import disputesRouter from './disputes';

const mockedService = disputeService as jest.Mocked<typeof disputeService>;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/disputes', disputesRouter);
  return app;
}

const auth = { Authorization: 'Bearer test-token' };

describe('disputes route (HTTP layer)', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  describe('POST /api/disputes', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).post('/api/disputes').send({ orderId: 'o1', reason: 'x' });
      expect(res.status).toBe(401);
      expect(mockedService.createDispute).not.toHaveBeenCalled();
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await request(app).post('/api/disputes').set(auth).send({});
      expect(res.status).toBe(400);
      expect(mockedService.createDispute).not.toHaveBeenCalled();
    });

    it('returns 400 when orderId is not a valid id', async () => {
      const res = await request(app)
        .post('/api/disputes')
        .set(auth)
        .send({ orderId: 123, reason: 'damaged' });
      expect(res.status).toBe(400);
      expect(mockedService.createDispute).not.toHaveBeenCalled();
    });

    it('creates a dispute and returns 201', async () => {
      const created = { id: 'd1', orderId: 'o1', reason: 'damaged', status: 'open' };
      mockedService.createDispute.mockResolvedValue(created as any);

      const res = await request(app)
        .post('/api/disputes')
        .set(auth)
        .send({ orderId: 'o1', reason: 'damaged' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(created);
      expect(mockedService.createDispute).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'o1', reason: 'damaged' }),
        expect.objectContaining({ id: 'user-1' }),
      );
    });

    it('returns 500 when the service throws', async () => {
      mockedService.createDispute.mockRejectedValue(new Error('boom'));
      const res = await request(app)
        .post('/api/disputes')
        .set(auth)
        .send({ orderId: 'o1', reason: 'damaged' });
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/disputes/:id/escalate', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).post('/api/disputes/d1/escalate').send({});
      expect(res.status).toBe(401);
      expect(mockedService.escalateDispute).not.toHaveBeenCalled();
    });

    it('returns 400 when the id param is missing', async () => {
      const res = await request(app).post('/api/disputes//escalate').set(auth).send({});
      expect(res.status).toBe(404);
      expect(mockedService.escalateDispute).not.toHaveBeenCalled();
    });

    it('escalates a dispute and returns 200', async () => {
      const escalated = { id: 'd1', status: 'escalated' };
      mockedService.escalateDispute.mockResolvedValue(escalated as any);

      const res = await request(app).post('/api/disputes/d1/escalate').set(auth).send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual(escalated);
      expect(mockedService.escalateDispute).toHaveBeenCalledWith('d1', expect.objectContaining({ id: 'user-1' }));
    });

    it('returns 404 when the dispute does not exist', async () => {
      mockedService.escalateDispute.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));
      const res = await request(app).post('/api/disputes/missing/escalate').set(auth).send({});
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/disputes/:id/resolve', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).post('/api/disputes/d1/resolve').send({ resolution: 'refund' });
      expect(res.status).toBe(401);
      expect(mockedService.resolveDispute).not.toHaveBeenCalled();
    });

    it('returns 400 when resolution is missing', async () => {
      const res = await request(app).post('/api/disputes/d1/resolve').set(auth).send({});
      expect(res.status).toBe(400);
      expect(mockedService.resolveDispute).not.toHaveBeenCalled();
    });

    it('resolves a dispute and returns 200', async () => {
      const resolved = { id: 'd1', status: 'resolved', resolution: 'refund' };
      mockedService.resolveDispute.mockResolvedValue(resolved as any);

      const res = await request(app)
        .post('/api/disputes/d1/resolve')
        .set(auth)
        .send({ resolution: 'refund' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(resolved);
      expect(mockedService.resolveDispute).toHaveBeenCalledWith(
        'd1',
        expect.objectContaining({ resolution: 'refund' }),
        expect.objectContaining({ id: 'user-1' }),
      );
    });

    it('returns 403 when the user is not allowed to resolve', async () => {
      mockedService.resolveDispute.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));
      const res = await request(app)
        .post('/api/disputes/d1/resolve')
        .set(auth)
        .send({ resolution: 'refund' });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/disputes/:id/withdraw', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).post('/api/disputes/d1/withdraw').send({});
      expect(res.status).toBe(401);
      expect(mockedService.withdrawDispute).not.toHaveBeenCalled();
    });

    it('withdraws a dispute and returns 200', async () => {
      const withdrawn = { id: 'd1', status: 'withdrawn' };
      mockedService.withdrawDispute.mockResolvedValue(withdrawn as any);

      const res = await request(app).post('/api/disputes/d1/withdraw').set(auth).send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual(withdrawn);
      expect(mockedService.withdrawDispute).toHaveBeenCalledWith('d1', expect.objectContaining({ id: 'user-1' }));
    });

    it('returns 409 when the dispute cannot be withdrawn in its current state', async () => {
      mockedService.withdrawDispute.mockRejectedValue(Object.assign(new Error('conflict'), { status: 409 }));
      const res = await request(app).post('/api/disputes/d1/withdraw').set(auth).send({});
      expect(res.status).toBe(409);
    });
  });
});
