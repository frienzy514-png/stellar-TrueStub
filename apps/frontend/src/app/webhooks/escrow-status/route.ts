import { NextRequest, NextResponse } from 'next/server';

/**
 * Trustless Work escrow-status webhook — pass-through to apps/backend (#233).
 *
 * apps/backend's `POST /webhooks/escrow-status` is the single authoritative
 * path for escrow status updates: it verifies the HMAC signature, writes the
 * status via HasuraService, and sends notifications. This route only exists
 * so webhook registrations pointing at the frontend keep working — it forwards
 * the raw body and signature header byte-for-byte and relays the backend's
 * response, so the signature still verifies and Trustless Work still sees
 * non-2xx (and retries) when the update fails.
 */
const SIGNATURE_HEADERS = ['x-trustless-work-signature', 'x-webhook-signature', 'x-signature'];

export async function POST(request: NextRequest) {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    console.error('[webhook:escrow-status] BACKEND_URL is not configured');
    return NextResponse.json({ error: 'Missing BACKEND_URL' }, { status: 500 });
  }

  const signatureHeader = SIGNATURE_HEADERS.find((name) => request.headers.has(name));
  if (!signatureHeader) {
    return NextResponse.json({ error: 'Missing webhook signature header' }, { status: 401 });
  }

  const rawBody = await request.text();

  let response: Response;
  try {
    response = await fetch(`${backendUrl}/webhooks/escrow-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [signatureHeader]: request.headers.get(signatureHeader)!,
      },
      body: rawBody,
      cache: 'no-store',
    });
  } catch (error) {
    console.error('[webhook:escrow-status] Backend unreachable:', error);
    return NextResponse.json({ error: 'Failed to reach escrow status service' }, { status: 502 });
  }

  const body = await response.json().catch(() => ({ error: 'Invalid response from escrow status service' }));
  return NextResponse.json(body, { status: response.status });
}
