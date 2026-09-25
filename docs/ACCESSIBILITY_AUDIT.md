# Accessibility (A11y) Audit & Remediation Report

**Date:** 2026-08-25  
**Target Areas:** Dashboard (`apps/frontend/src/components/dashboard/`), Escrow Journey (`apps/frontend/src/components/escrow/`), Auth & Multi-Wallet Modals (`apps/frontend/src/components/auth/wallet/`).

---

## 1. Executive Summary

An automated and manual WCAG 2.1 AA accessibility audit was conducted on TrueStub's primary user flows, focusing on:
- Keyboard navigation and interactive element roles
- Screen reader announcements, ARIA labels, and live region statuses
- Dialog and modal semantics (focus trapping, ESC key listeners, `role="dialog"`, `aria-modal`)
- Text and icon color contrast ratios (> 4.5:1 for normal text, > 3:1 for large text / UI elements)

All critical and serious violations have been remediated across the target components.

---

## 2. Audited Components & Remediation Details

### A. Escrow Table (`EscrowTable.tsx`)
- **Issue:** Missing explicit table header scopes, non-descriptive checkbox labels, and unlabeled menu buttons.
- **Fixes Applied:**
  - Added descriptive `aria-label`s to row checkboxes (e.g. `Select escrow <id>`).
  - Added `aria-label="Open menu"` and `sr-only` text to action dropdown trigger buttons.
  - Verified keyboard navigation across row action items.

### B. Escrow Role Cards (`EscrowCard.tsx`)
- **Issue:** Interactive list items lacked `role="button"`, `tabIndex={0}`, and keyboard event handlers (`Enter`/`Space`). Decorative SVGs lacked `aria-hidden`.
- **Fixes Applied:**
  - Added `role="button"`, `tabIndex={0}`, `aria-label`, and `onKeyDown` handlers allowing full keyboard navigation.
  - Added `role="status"` and `aria-label="Loading escrows"` to async loaders.
  - Added `role="region"` and accessible landmarks to the card container.
  - Marked decorative SVG icons with `aria-hidden="true"`.

### C. Milestone Progress (`milestone-progress.tsx`)
- **Issue:** Visual progress steps lacked structured list semantics, status indicators lacked screen-reader text, and milestone statuses had subtle color contrast.
- **Fixes Applied:**
  - Wrapped progress in `<ol role="list" aria-label="Milestone Progress">` with `<li role="listitem">`.
  - Added `<span className="sr-only"> - Status: {milestone.status}</span>` for assistive technologies.
  - Enhanced text color tokens (`text-green-700 dark:text-green-400`, `text-blue-700 dark:text-blue-400`, `text-red-700 dark:text-red-400`) to meet WCAG AA contrast standards.

### D. Multi-Wallet Connection Modals (`WalletConnectionModal.tsx`, `MainWalletSelectionModal.tsx`, `WalletSelectionModal.tsx`, `MetaMaskWalletModal.tsx`, `WalletOption.tsx`)
- **Issue:** Modal overlays lacked `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`. Close buttons lacked accessible names. ESC key did not dismiss dialogs.
- **Fixes Applied:**
  - Added `role="dialog"`, `aria-modal="true"`, and associated `aria-labelledby` IDs.
  - Implemented `Escape` key event listeners across all wallet modals for keyboard dismissal.
  - Added explicit `aria-label` attributes to close buttons, install buttons, and wallet selection cards.
  - Provided `onKeyDown` activation (`Enter` / `Space`) for wallet choice cards.

---

## 3. Compliance Matrix

| Rule ID | Description | Status | Verification |
|---|---|---|---|
| `button-name` | Buttons must have discernible text | PASS | Verified on all icon-only & dropdown buttons |
| `aria-dialog-name` | Dialogs must have accessible names | PASS | `aria-labelledby` attached to headings |
| `keyboard-navigation` | All interactive elements operable via keyboard | PASS | Tab, Enter, Space, and Escape validated |
| `color-contrast` | Meets 4.5:1 minimum contrast | PASS | Updated status and text tokens |
| `list` / `listitem` | Structured lists for sequences | PASS | Added to milestone progress & wallet lists |

---

## 4. Recommendations for Future Development
1. Include `eslint-plugin-jsx-a11y` in the frontend linting pipeline.
2. Automate axe-core runs in CI on core pages before release.
3. Test all newly introduced modal components with screen readers (VoiceOver, NVDA).
