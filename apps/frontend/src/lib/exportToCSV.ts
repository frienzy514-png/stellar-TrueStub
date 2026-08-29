export interface TransactionRow {
  purchaseId: string;
  event: string;
  transferInitiated: string;
  transferCompleted: string;
  amount: number;
  status: string;
}

export interface WalletRow {
  address: string;
  network: string;
  isPrimary: boolean;
}

function downloadCSV(headers: string[], rows: (string | number)[][], filename: string): void {
  const csvContent = [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportTransactionsToCSV(
  transactions: TransactionRow[],
  filename = "truestub-transactions.csv",
): void {
  const headers = [
    "Booking ID",
    "Hotel",
    "Check-in",
    "Check-out",
    "Amount (USD)",
    "Status",
  ];

  const rows = transactions.map((t) => [
    t.purchaseId,
    t.event,
    t.transferInitiated,
    t.transferCompleted,
    t.amount.toFixed(2),
    t.status,
  ]);

  downloadCSV(headers, rows, filename);
}

export function exportWalletsToCSV(
  wallets: WalletRow[],
  filename = "truestub-wallets.csv",
): void {
  const headers = ["Address", "Network", "Primary"];

  const rows = wallets.map((w) => [
    w.address,
    w.network,
    w.isPrimary ? "Yes" : "No",
  ]);

  downloadCSV(headers, rows, filename);
}
