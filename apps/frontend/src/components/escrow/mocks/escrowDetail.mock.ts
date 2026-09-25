import type { EscrowDetail } from "../views/types";

/**
 * MOCK DATA — not a real data source.
 *
 * Placeholder escrow detail used by the escrow pages until
 * useQuery(GET_ESCROW_BY_ID) is wired (GraphQL wiring issue). Delete this file
 * once that lands; nothing in production code should depend on it afterwards.
 */
export function getMockEscrowDetail(escrowId: string): EscrowDetail {
  return {
    id: escrowId,
    invoiceNumber: "INV4257-09-012",
    // Safe fallback when subscription has no row yet (maps to pending → redirect).
    // Override locally (e.g. "funded") to demo views without backend.
    status: "unknown",
    createdAt: "2025-01-25",
    amount: 4000,
    paymentBatchTitle: "Payment batch — January 2025",
    subject: "Ticket resale — Coldplay: Music of the Spheres",
    currency: "USDC",
    issued: "25 January 2025",
    dueDate: "10 February 2025",
    notes: "Buyer funds are held in escrow until the ticket transfer is verified.",
    billedTo: "John Smith",
    billingDetails: "Coldplay: Music of the Spheres · West Floor, Row 12 · 2 tickets",
    products: [
      {
        product: "Resale tickets (x2)",
        pricePerMonth: "$3,200",
        deposit: "$800",
      },
      {
        product: "Platform fee",
        pricePerMonth: "—",
        deposit: "$0",
      },
    ],
    subtotal: "$4,000",
    discount: "$0",
    total: "$4,000",
    terms:
      "Payment is processed via TrueStub escrow. Funds are released to the seller once the ticket transfer is confirmed.",
    tenant: {
      name: "John Smith",
      wallet: "MJE...XN32",
      email: "John_s@gmail.com",
      rentalDate: "20 January 2025",
      depositAmount: "$800",
    },
    owner: {
      name: "Alberto Casas",
      wallet: "MJE...XN32",
      email: "albertoCasas100@gmail.com",
    },
    beneficiary: {
      name: "Alberto Casas",
      wallet: "MJE...XN32",
      email: "albertoCasas100@gmail.com",
      releasedDate: "15 February 2025",
      depositAmount: "$800",
      phone: "+1 (555) 010-4200",
    },
    escrowJustification:
      "Buyer confirmed receipt of the transferred tickets. No issues reported. Funds approved for release to the seller.",
    claimsPlaceholder: "Describe any claims or notes for this release…",
    listing: { name: "Coldplay: Music of the Spheres", image: "/img/event/event1.jpg" },
  };
}
