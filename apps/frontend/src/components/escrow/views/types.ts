export type EscrowParty = {
  name: string;
  wallet: string;
  email: string;
};

export type EscrowTenant = EscrowParty & {
  rentalDate: string;
  depositAmount: string;
};

export type EscrowBeneficiary = EscrowParty & {
  releasedDate: string;
  depositAmount: string;
  phone: string;
};

export type EscrowProductRow = {
  product: string;
  pricePerMonth: string;
  deposit: string;
};

/** Escrow detail shape rendered by the escrow views (see mocks/escrowDetail.mock.ts until GET_ESCROW_BY_ID is wired) */
export type EscrowDetail = {
  id: string;
  invoiceNumber: string;
  status: string;
  createdAt: string;
  amount: number;
  paymentBatchTitle: string;
  subject: string;
  currency: string;
  issued: string;
  dueDate: string;
  notes: string;
  billedTo: string;
  billingDetails: string;
  products: EscrowProductRow[];
  subtotal: string;
  discount: string;
  total: string;
  terms: string;
  tenant: EscrowTenant;
  owner: EscrowParty;
  beneficiary: EscrowBeneficiary;
  escrowJustification: string;
  claimsPlaceholder: string;
  listing: { name: string; image: string };
};
