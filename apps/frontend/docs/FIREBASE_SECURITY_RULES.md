# Firebase Security Rules

## Overview

TrueStub uses Firebase for **Authentication only**. The client SDK in
`src/lib/firebase.ts` calls `getAuth()` — it does **not** initialise
Firestore or Storage client-side. Application data (escrows, listings,
users) is stored in Postgres and exposed via Hasura GraphQL, authenticated
with a Firebase JWT token (see `src/config/apollo.ts`).

Because the app doesn't read or write Firestore/Storage from the browser,
the security rules below default-deny all client access. This is the
safest posture: if a misconfigured call slips through, Firebase rejects it
at the rules layer rather than exposing data.

---

## Rule files in this repo

| File | Firebase product | Deployed via |
|------|-----------------|--------------|
| `apps/frontend/firestore.rules` | Firestore | `firebase deploy --only firestore:rules` |
| `apps/frontend/storage.rules` | Cloud Storage | `firebase deploy --only storage` |
| `apps/frontend/firestore.indexes.json` | Firestore indexes | `firebase deploy --only firestore:indexes` |
| `firebase.json` (repo root) | Firebase project config | points at the above |

---

## Current rules summary

### Firestore (`firestore.rules`)

```
match /{document=**} {
  allow read, write: if false;
}
```

Every Firestore read and write from a browser client is denied. This is
correct while Firestore is unused: there is no data to protect and no
legitimate client path that needs it.

### Storage (`storage.rules`)

```
match /{allPaths=**} {
  allow read, write: if false;
}
```

Same posture for Cloud Storage.

---

## Deploying the rules

1. Install the Firebase CLI (once per machine):

   ```bash
   npm install -g firebase-tools
   ```

2. Authenticate:

   ```bash
   firebase login
   ```

3. Set your project (use the `projectId` from `.env.local`):

   ```bash
   firebase use <your-project-id>
   ```

4. Deploy rules only (safe, does not touch hosting or functions):

   ```bash
   # From the repo root — firebase.json lives here
   firebase deploy --only firestore:rules,storage
   ```

---

## Adding rules when Firestore is used in future

If a feature requires client-side Firestore access, add a targeted rule
**above** the catch-all deny in `firestore.rules`. Follow the principle of
least privilege:

```js
// Good: user can only read/write their own document
match /users/{userId} {
  allow read, write: if request.auth != null
                     && request.auth.uid == userId;
}

// Good: public read, authenticated write, size + type validated
match /eventImages/{imageId} {
  allow read: if true;
  allow write: if request.auth != null
               && request.resource.size < 5 * 1024 * 1024   // 5 MB
               && request.resource.contentType.matches('image/.*');
}
```

Avoid `allow read, write: if request.auth != null` at a high level — it
grants every logged-in user access to everything in that subtree.

---

## Security note on public config values

The Firebase SDK config values (`apiKey`, `projectId`, etc.) exposed via
`NEXT_PUBLIC_FIREBASE_*` environment variables are **intentionally public**
— Firebase is designed this way and documents it. These values identify
your Firebase project so the SDK can route requests; they do not grant
elevated access. The real security boundary is these rules files.

What must **never** be public:
- The Firebase Admin SDK service account private key (used only in
  `apps/backend`, never in this workspace).
- `HASURA_GRAPHQL_ADMIN_SECRET` (same — backend only, never
  `NEXT_PUBLIC_*`).

See `apps/frontend/README.md` for the full environment-variable guidance.
