import { fireEvent, render, screen } from "@testing-library/react";
import EscrowPage from "./page";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe("EscrowPage", () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  it("navigates to the escrow creation flow when New Escrow is clicked", () => {
    render(<EscrowPage />);

    fireEvent.click(screen.getByRole("button", { name: /new escrow/i }));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/dashboard/event/create-escrow");
  });
});
