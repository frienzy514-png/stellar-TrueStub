import { exportTransactionsToCSV, exportWalletsToCSV, TransactionRow, WalletRow } from "./exportToCSV";

describe("exportTransactionsToCSV", () => {
  let originalCreateObjectURL: typeof window.URL.createObjectURL;
  let originalRevokeObjectURL: typeof window.URL.revokeObjectURL;
  let createdUrl: string;
  let linkClickSpy: jest.SpyInstance;
  let createdLink: HTMLAnchorElement | null = null;

  beforeEach(() => {
    createdUrl = "blob:http://localhost/test-blob-url";
    originalCreateObjectURL = window.URL.createObjectURL;
    originalRevokeObjectURL = window.URL.revokeObjectURL;

    window.URL.createObjectURL = jest.fn().mockReturnValue(createdUrl);
    window.URL.revokeObjectURL = jest.fn();

    createdLink = null;
    const originalCreateElement = document.createElement.bind(document);
    jest
      .spyOn(document, "createElement")
      .mockImplementation((tagName: string) => {
        const element = originalCreateElement(tagName);
        if (tagName === "a") {
          createdLink = element as HTMLAnchorElement;
          linkClickSpy = jest
            .spyOn(createdLink, "click")
            .mockImplementation(() => {});
        }
        return element;
      });
  });

  afterEach(() => {
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
    jest.restoreAllMocks();
  });

  it("should generate CSV and trigger download for transaction rows", () => {
    const mockTransactions: TransactionRow[] = [
      {
        purchaseId: "BOOK-101",
        event: "Grand Hotel",
        transferInitiated: "2026-08-01",
        transferCompleted: "2026-08-05",
        amount: 250,
        status: "completed",
      },
      {
        purchaseId: 'BOOK-"102"',
        event: 'Hotel "Lux"',
        transferInitiated: "2026-08-10",
        transferCompleted: "2026-08-15",
        amount: 500.5,
        status: "pending",
      },
    ];

    exportTransactionsToCSV(mockTransactions, "custom-filename.csv");

    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(createdLink).not.toBeNull();
    expect(createdLink?.download).toBe("custom-filename.csv");
    expect(createdLink?.href).toBe(createdUrl);
    expect(linkClickSpy).toHaveBeenCalled();
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith(createdUrl);
  });

  it("should use default filename if omitted", () => {
    const mockTransactions: TransactionRow[] = [];

    exportTransactionsToCSV(mockTransactions);

    expect(createdLink?.download).toBe("truestub-transactions.csv");
  });
});

describe("exportWalletsToCSV", () => {
  let originalCreateObjectURL: typeof window.URL.createObjectURL;
  let originalRevokeObjectURL: typeof window.URL.revokeObjectURL;
  let createdUrl: string;
  let linkClickSpy: jest.SpyInstance;
  let createdLink: HTMLAnchorElement | null = null;

  beforeEach(() => {
    createdUrl = "blob:http://localhost/test-wallet-blob-url";
    originalCreateObjectURL = window.URL.createObjectURL;
    originalRevokeObjectURL = window.URL.revokeObjectURL;

    window.URL.createObjectURL = jest.fn().mockReturnValue(createdUrl);
    window.URL.revokeObjectURL = jest.fn();

    createdLink = null;
    const originalCreateElement = document.createElement.bind(document);
    jest
      .spyOn(document, "createElement")
      .mockImplementation((tagName: string) => {
        const element = originalCreateElement(tagName);
        if (tagName === "a") {
          createdLink = element as HTMLAnchorElement;
          linkClickSpy = jest
            .spyOn(createdLink, "click")
            .mockImplementation(() => {});
        }
        return element;
      });
  });

  afterEach(() => {
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
    jest.restoreAllMocks();
  });

  it("should generate CSV and trigger download for wallet rows", () => {
    const mockWallets: WalletRow[] = [
      { address: "GASK...XN32", network: "Stellar", isPrimary: true },
      { address: 'GB"QUOTED"ADDR', network: "Stellar", isPrimary: false },
    ];

    exportWalletsToCSV(mockWallets, "custom-wallets.csv");

    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(createdLink).not.toBeNull();
    expect(createdLink?.download).toBe("custom-wallets.csv");
    expect(createdLink?.href).toBe(createdUrl);
    expect(linkClickSpy).toHaveBeenCalled();
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith(createdUrl);
  });

  it("should use default filename if omitted", () => {
    exportWalletsToCSV([]);

    expect(createdLink?.download).toBe("truestub-wallets.csv");
  });
});
