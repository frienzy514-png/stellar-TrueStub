# `__dev__/` — development-only components

Files in this directory are **not for production use**.

## What goes here

- Components that exist solely to smoke-test or exercise infrastructure (Apollo, GraphQL, etc.)
- Anything that should never appear in a production build

## Convention

1. **Never import** anything from `__dev__/` in production pages, providers, or layouts.
2. If you need to use one of these components locally, do it in a dev-only route  
   (e.g. `app/(dev)/apollo-test/page.tsx`) and guard the route:

   ```ts
   // app/(dev)/apollo-test/page.tsx
   import { notFound } from "next/navigation";

   if (process.env.NODE_ENV === "production") notFound();

   const ApolloTestComponent = (await import("@/components/__dev__/ApolloTestComponent")).default;
   export default function Page() { return <ApolloTestComponent />; }
   ```

3. Each file in `__dev__/` should throw (or log a warning) if accidentally  
   rendered in production — see the `process.env.NODE_ENV` guard at the top  
   of `ApolloTestComponent.tsx`.

## Current files

| File | Purpose |
|---|---|
| `ApolloTestComponent.tsx` | Smoke-tests the Apollo/Hasura connection: queries escrow transactions, creates a test user |

Related dev-only GraphQL operations live under:
- `src/graphql/mutations/__dev__/test-user.ts`
- `src/graphql/queries/__dev__/testQuery.graphql.ts`
