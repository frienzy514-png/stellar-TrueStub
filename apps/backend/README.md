# Backend

Express + TypeScript API for the escrow platform.

## Scripts

- `npm run dev` — start the API in watch mode.
- `npm run build` — compile TypeScript to `dist/`.
- `npm start` — run the compiled server.
- `npm test` — run the unit/integration test suite.

## Escrow status webhook

`POST /webhooks/escrow-status` is the single authoritative write path for escrow
status changes. Every status transition for every escrow flows through this
handler, so it must stay correct under concurrent deliveries (many escrows
changing status around the same event, or Trustless Work retrying a batch of
deliveries after a network blip).

### Load test

The load test lives in `loadtest/escrow-status-webhook.js` and is written for
[k6](https://k6.io/). It fires concurrent webhook deliveries at the handler and
asserts that every request is accepted (`2xx`) and that no updates are dropped
or corrupted under load.

Install k6 (see the k6 docs for your platform), then run:

```bash
# from apps/backend
k6 run loadtest/escrow-status-webhook.js
```

Configuration via environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `BASE_URL` | `http://localhost:3000` | Base URL of the running backend. |
| `WEBHOOK_SECRET` | `dev-webhook-secret` | Shared secret used to sign webhook payloads. |
| `RATE` | `50` | Target webhook deliveries per second. |
| `DURATION` | `30s` | Duration of the sustained load stage. |
| `VUS` | `50` | Number of concurrent virtual users. |

Example against a local server:

```bash
BASE_URL=http://localhost:3000 RATE=100 DURATION=1m k6 run loadtest/escrow-status-webhook.js
```

**Realistic target throughput:** the test passes at **50 deliveries/second**
sustained for 30 seconds (defaults), and is expected to hold at **100
deliveries/second** on a single backend instance. The thresholds fail the run if
any request returns a non-2xx status or if the error rate exceeds 1%, which
catches dropped or corrupted updates under load.
