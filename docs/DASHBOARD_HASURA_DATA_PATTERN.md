# Dashboard mock data: shared root cause and recommended pattern

Issue: #536 (related: #494, #496, #497, #499, #500)

## Finding

The mock-data issues share one root cause, and it's **not** missing
infrastructure. The authenticated Hasura plumbing already exists and works:

- `src/config/apollo.ts` is a single Apollo client. It attaches the Firebase ID
  token as the Hasura JWT, and it handles errors, retries and subscriptions.
- `src/graphql/queries/*` holds the GraphQL documents.
- `src/hooks/useTicketListings.ts` and `src/hooks/useEscrow.ts` are pages that
  are already wired to real data, and they show the pattern working end to end.

The real problem is that there's **no documented convention**. Every dashboard
page wrote its own data access, and the quickest way to unblock UI work was to
import a mock straight into the page component:

| Page / component | Mock it uses |
| --- | --- |
| `app/dashboard/escrow/[id]/page.tsx` | `getMockEscrowDetail` |
| `app/dashboard/escrow-dashboard/RoleEscrowDashboardPage.tsx` | `fetchMockEscrows`, `generateMockNotifications` |
| `components/dashboard/profile/PrivacyDataSection.tsx` | `fetchMockEscrows` |
| `components/dashboard/guest/GuestDashboard.tsx` | `STUB_EVENTS` |

Each page loads its mock from inside the component, so moving it to real data
means changing the component itself. That's why each page stalled separately.

## Recommendation

Follow the existing per-resource hook pattern. Don't add a new generic
"authenticated query" abstraction, because Apollo's `useQuery` together with
the shared client already does that job.

For each page:

1. Put the GraphQL document in `src/graphql/queries/<resource>-queries.ts`.
2. Add a hook in `src/hooks/use<Resource>.ts` that calls `useQuery` from
   `@apollo/client/react`. The hook maps the Hasura rows into the UI type and
   returns `{ data, loading, error }`.
3. The page component calls only the hook. It never imports from
   `lib/mockData` or `*/mocks/*`.
4. Mocks are allowed only in tests and Storybook.

Reference implementation: `src/hooks/useTicketListings.ts`. It has a typed raw
row, a `where` builder, a row-to-UI mapping, and a `{ data, loading, error }`
return.

With this pattern, the remaining wiring issues become "write one hook and swap
one import" per page. A review rule such as "no `mockData` imports outside tests"
keeps the mocks from creeping back in.
