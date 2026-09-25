/**
 * Minimal EIP-1193 provider shape for the wallet injected at `window.ethereum`
 * (MetaMask and compatible extensions). Structurally compatible with ethers'
 * `Eip1193Provider`, so it can be passed straight to `new BrowserProvider()`.
 * See https://eips.ethereum.org/EIPS/eip-1193
 */
interface InjectedEthereumRequestArguments {
  readonly method: string;
  readonly params?: readonly unknown[] | Record<string, unknown>;
}

interface InjectedEthereumProvider {
  isMetaMask?: boolean;
  /** Present when several wallet extensions inject into the same page. */
  providers?: InjectedEthereumProvider[];

  request<T = unknown>(args: InjectedEthereumRequestArguments): Promise<T>;

  on(event: "accountsChanged", listener: (accounts: string[]) => void): void;
  on(event: "chainChanged", listener: (chainId: string) => void): void;
  on(event: "disconnect", listener: (error: unknown) => void): void;
  on(event: string, listener: (...args: unknown[]) => void): void;

  removeListener(
    event: "accountsChanged",
    listener: (accounts: string[]) => void,
  ): void;
  removeListener(event: "chainChanged", listener: (chainId: string) => void): void;
  removeListener(event: "disconnect", listener: (error: unknown) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

interface Window {
  ethereum?: InjectedEthereumProvider;
}
