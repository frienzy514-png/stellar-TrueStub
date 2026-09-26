# TypeScript strictness & `any` baseline

Tracking doc for issue #184. Recorded on 2026-09-24 against `main` plus the
changes in the PR that introduced this file (which removed the `any` on
`Window.ethereum` (#183) and the unused `useCacheWarming` hook (#182)).

## tsconfig strictness

`apps/frontend/tsconfig.json` has `"strict": true`, which turns on
`noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`,
`strictBindCallApply`, `strictPropertyInitialization`,
`useUnknownInCatchVariables`, `alwaysStrict` and `noImplicitThis`.

Things to be aware of:

- `allowJs: true` — plain `.js` files under `src/` are not type-checked
  (`checkJs` is off), so they are an implicit-`any` blind spot.
- `skipLibCheck: true` — `.d.ts` files (including `src/types/global.d.ts`) are
  not checked for internal errors.
- `cypress/` is excluded from the project and not covered by these numbers.

Implicit `any` is therefore already a compile error; the remaining exposure is
**explicit** `any`.

## Baseline: explicit `any` in `apps/frontend/src`

| Pattern                                              | Count  |
| ---------------------------------------------------- | ------ |
| `: any` annotations                                  | 52     |
| &nbsp;&nbsp;of which `catch (e: any)`                | 18     |
| `as any` casts                                       | 23     |
| `any[]`                                              | 2      |
| Generic args (`<any>`, `Record<string, any>`, …)     | 5      |
| **Total lines containing an explicit `any`**         | **78** |
| &nbsp;&nbsp;in application code                      | 75     |
| &nbsp;&nbsp;in tests (`*.test.*`, `__tests__/`)      | 3      |

Spread across 36 files. Largest contributors:

| File                                                        | Lines |
| ----------------------------------------------------------- | ----- |
| `src/components/auth/wallet/hooks/useMultiWallet.ts`        | 8     |
| `src/components/dev/ApolloTestComponent.tsx`                | 6     |
| `src/components/auth/wallet/hooks/metamask-wallet.hook.ts`  | 5     |
| `src/utils/optimistic-updates.ts`                           | 4     |
| `src/utils/cache-utils.ts`                                  | 4     |
| `src/components/escrow/hook/useEscrowStatus.ts`             | 4     |
| `src/components/auth/wallet/hooks/multi-wallet.hook.ts`     | 4     |

Counts are per line (a line with two `any`s counts once), exclude
`src/graphql/generated/`, and skip comment lines. Reproduce with:

```sh
cd apps/frontend
grep -rnE "(:\s*any\b|\bas any\b|\bany\[\]|<any>|<any,|, any>|Record<string, ?any>|Array<any>)" \
  src --include=*.ts --include=*.tsx \
  | grep -v "src/graphql/generated" \
  | grep -vE ":[0-9]+:\s*(//|\*|/\*)" \
  | wc -l
```

## Keeping it from growing

- `eslint.config.mjs` now enables `@typescript-eslint/no-explicit-any` as a
  **warning** for `*.ts` / `*.tsx`. It is a warning rather than an error so
  the existing 78 don't fail `yarn lint`; new code shows up in the editor and
  in lint output.
- Once the count is brought down (easy wins: the 18 `catch (e: any)` →
  `catch (e: unknown)` and narrowing, and the wallet hooks now that
  `window.ethereum` is typed), flip the rule to `"error"` and use targeted
  `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with a
  reason for anything that genuinely needs it.
- When touching this doc, update the table so the trend stays visible.
