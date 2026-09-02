# handle-errors

Centralised error-handling utilities for the Trustless Work integration.  
All escrow hooks that interact with the TW SDK or the platform API should
funnel their `catch` blocks through this module.

## Directory structure

```
tw-blocks/handle-errors/
├── errors.enum.ts   # ApiErrorTypes enum
└── handle.ts        # handleError() + exported types
```

## Types

### `ErrorResponse`

```ts
type ErrorResponse = {
  message: string; // Human-readable description
  code: number;    // HTTP status code (or -4 for wallet errors)
  type: ApiErrorTypes;
};
```

### `WalletError`

A subset of `ErrorResponse` — only `message` and `code` — used for errors
thrown directly by the Stellar wallet adapter (e.g. the user closing the
wallet modal before the transaction is signed).

### `ApiErrorTypes`

| Value           | When it is assigned                        |
| --------------- | ------------------------------------------ |
| `NOT_FOUND`     | HTTP 404                                   |
| `UNAUTHORIZED`  | HTTP 401                                   |
| `WALLET_ERROR`  | `error.code === -4` (wallet closed early)  |
| `UNKNOWN_ERROR` | Any other status code / unrecognised error |

## Usage

```ts
import {
  ErrorResponse,
  handleError,
} from "@/components/tw-blocks/handle-errors/handle";

// Inside a TanStack Mutation or async handler:
try {
  await someEscrowAction();
} catch (error) {
  toast.error(handleError(error as ErrorResponse).message);
}
```

`handleError` accepts either an `AxiosError` (from SDK / API calls) or a
`WalletError` (from the wallet adapter) and always returns a normalised
`ErrorResponse`. You never need to inspect the raw error shape outside this
module.

## Relationship to `tw-blocks/escrows/`

The escrow-action hooks (e.g. `useInitializeEscrow`, `useFundEscrow`) live in
`tw-blocks/escrows/`. They call `handleError` in their `catch` block and
surface the resulting `message` through `sonner` toasts. If you add a new
escrow action, follow the same pattern — do not re-implement error mapping
inline.
