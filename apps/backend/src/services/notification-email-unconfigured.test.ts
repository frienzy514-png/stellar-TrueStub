/**
 * Issue #570 — when EMAIL_PROVIDER / SENDGRID_API_KEY are unset, notification
 * delivery must degrade gracefully: the caller's primary operation (e.g. a
 * webhook status update) must still succeed instead of throwing.
 */
const mockCreate = jest.fn();
const mockDeliver = jest.fn();
const mockDeadLetter = jest.fn();
const mockExists = jest.fn();

jest.mock(
  "../repositories/notification.repository",
  () => ({
    NotificationRepository: jest.fn().mockImplementation(() => ({
      existsByEventId: mockExists,
      create: mockCreate,
      deliver: mockDeliver,
      createDeadLetter: mockDeadLetter,
    })),
  }),
  { virtual: true },
);
jest.mock("../utils/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }), {
  virtual: true,
});
jest.mock("../lib/sentry", () => ({ captureException: jest.fn() }));

import { NotificationService } from "./notification.service";

describe("notification delivery with email provider unset (#570)", () => {
  const saved = { EMAIL_PROVIDER: process.env.EMAIL_PROVIDER, SENDGRID_API_KEY: process.env.SENDGRID_API_KEY };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    delete process.env.EMAIL_PROVIDER;
    delete process.env.SENDGRID_API_KEY;
    mockExists.mockResolvedValue(false);
    mockCreate.mockResolvedValue(undefined);
    mockDeadLetter.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env.EMAIL_PROVIDER = saved.EMAIL_PROVIDER;
    process.env.SENDGRID_API_KEY = saved.SENDGRID_API_KEY;
    if (saved.EMAIL_PROVIDER === undefined) delete process.env.EMAIL_PROVIDER;
    if (saved.SENDGRID_API_KEY === undefined) delete process.env.SENDGRID_API_KEY;
  });

  it("resolves (does not throw) when the provider is unconfigured, and dead-letters the notification", async () => {
    mockDeliver.mockRejectedValue(new Error("EMAIL_PROVIDER is not configured"));
    const service = new NotificationService();

    const run = service.sendNotification({
      eventId: "evt-570",
      type: "escrow_released",
      userId: "user-1",
    } as any);
    // Drain the retry backoff timers.
    await jest.runAllTimersAsync();

    await expect(run).resolves.toBeUndefined();
    expect(mockDeadLetter).toHaveBeenCalledTimes(1);
    expect(mockDeadLetter.mock.calls[0][0].isFinancial).toBe(true);
  });

  it("does not throw to the caller on a permanent (4xx) provider error", async () => {
    mockDeliver.mockRejectedValue(Object.assign(new Error("bad request"), { status: 400 }));
    const service = new NotificationService();

    await expect(
      service.sendNotification({ eventId: "evt-570-b", type: "escrow_funded", userId: "user-1" } as any),
    ).resolves.toBeUndefined();
    expect(mockDeliver).toHaveBeenCalledTimes(1);
  });
});
