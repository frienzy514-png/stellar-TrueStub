/**
 * Regression coverage for issue #137: confirm `ConnectionStatus.tsx` (via
 * `useConnectionStatus`) reflects the *real* WebSocket subscription health
 * (`config/apollo.ts`'s `wsClient` lifecycle events), not a static/mocked
 * value.
 *
 * `config/apollo.ts` wires graphql-ws's `connected`/`connecting`/`closed`
 * events to `updateGlobalConnectionState` (see apollo.ts:50-52), which is
 * the same global store `useConnectionStatus` reads from. These tests drive
 * that store directly — the same seam apollo.ts uses — and assert the
 * rendered indicator updates accordingly, so a future change that
 * disconnects the wiring (e.g. reverting to a hardcoded status) fails here
 * instead of silently misleading users about live-update connectivity.
 */
import { act, render, screen } from "@testing-library/react";
import { ConnectionStatus } from "./ConnectionStatus";
import { updateGlobalConnectionState } from "@/hooks/useConnectionStatus";

describe("ConnectionStatus (issue #137)", () => {
  beforeEach(() => {
    // Reset to the hook's default global state and ensure we start online.
    act(() => updateGlobalConnectionState("disconnected"));
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  it("renders nothing while the WebSocket is connected", () => {
    act(() => updateGlobalConnectionState("connected"));
    render(<ConnectionStatus />);

    expect(screen.queryByText(/connected|reconnecting|offline/i)).not.toBeInTheDocument();
  });

  it("shows 'Reconnecting...' when graphql-ws emits its 'connecting' event", () => {
    act(() => updateGlobalConnectionState("connected"));
    render(<ConnectionStatus />);

    // Simulate wsClient.on("connecting", ...) firing after a dropped socket.
    act(() => updateGlobalConnectionState("reconnecting"));

    expect(screen.getByText("Reconnecting...")).toBeInTheDocument();
  });

  it("shows 'Disconnected' when graphql-ws emits its 'closed' event", () => {
    act(() => updateGlobalConnectionState("connected"));
    render(<ConnectionStatus />);

    // Simulate wsClient.on("closed", ...) firing (e.g. socket killed via dev tools).
    act(() => updateGlobalConnectionState("disconnected"));

    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });

  it("recovers to hidden once graphql-ws reports 'connected' again", () => {
    act(() => updateGlobalConnectionState("disconnected"));
    render(<ConnectionStatus />);
    expect(screen.getByText("Disconnected")).toBeInTheDocument();

    act(() => updateGlobalConnectionState("connected"));

    expect(screen.queryByText(/connected|reconnecting|offline/i)).not.toBeInTheDocument();
  });

  it("shows 'Offline' when the browser itself loses network, even if the WS state is stale-connected", () => {
    act(() => updateGlobalConnectionState("connected"));
    render(<ConnectionStatus />);

    act(() => {
      Object.defineProperty(window.navigator, "onLine", {
        configurable: true,
        value: false,
      });
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.getByText("Offline")).toBeInTheDocument();
  });
});
