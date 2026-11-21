/**
 * Confirms the Firebase Admin SDK rejects ID tokens issued for a different
 * Firebase project (issue #552).
 *
 * The token is an unsigned JWT whose `aud`/`iss` point at another project. The
 * SDK checks those claims before it fetches signing keys, so no network call is
 * made and the rejection is deterministic.
 */

import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const PROJECT_ID = 'test-project';
const OTHER_PROJECT_ID = 'attacker-project';

function craftToken(projectId: string): string {
  const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: 'RS256', kid: 'fake-kid', typ: 'JWT' });
  const payload = b64url({
    aud: projectId,
    iss: `https://securetoken.google.com/${projectId}`,
    sub: 'victim-uid',
    user_id: 'victim-uid',
    auth_time: now,
    iat: now,
    exp: now + 3600,
  });
  return `${header}.${payload}.c2lnbmF0dXJl`;
}

describe('Firebase Admin verifyIdToken — cross-project tokens (#552)', () => {
  let app: App;

  beforeAll(() => {
    app = initializeApp({ projectId: PROJECT_ID }, `cross-project-${Date.now()}`);
  });

  afterAll(async () => {
    await deleteApp(app);
  });

  it('rejects a token issued for a different Firebase project', async () => {
    await expect(getAuth(app).verifyIdToken(craftToken(OTHER_PROJECT_ID))).rejects.toThrow();
  });

  it('does not accept a token for the other project even when the signature is absent', async () => {
    const token = craftToken(OTHER_PROJECT_ID);
    await expect(getAuth(app).verifyIdToken(token)).rejects.toMatchObject({
      code: expect.stringMatching(/argument-error|invalid-argument|id-token-invalid|invalid-id-token/),
    });
  });
});
