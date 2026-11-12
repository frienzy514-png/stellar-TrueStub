import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

const mockUseQuery = jest.fn();
const mockUseMutation = jest.fn();
const mockPush = jest.fn();
const mockUseParams = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

jest.mock("@apollo/client/react", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => mockUseParams(),
}));

jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

jest.mock("@/hooks/useCurrentUserId", () => ({
  useCurrentUserId: () => "user-uid-001",
}));

import EventsPage from "@/app/dashboard/events/page";
import EventDetailPage from "@/app/dashboard/events/[id]/page";
import NewEventPage from "@/app/dashboard/events/new/page";
import { GET_EVENTS, GET_EVENT_BY_ID } from "@/graphql/queries/event-queries";
import { INSERT_EVENT } from "@/graphql/mutations/event-mutations";

describe("Dashboard events list, detail, and create pages (#500)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseParams.mockReturnValue({ id: "evt-101" });
  });

  describe("EventsPage (list)", () => {
    it("renders persisted events from GET_EVENTS and never falls back to local stubs", () => {
      mockUseQuery.mockReturnValue({
        loading: false,
        error: undefined,
        data: {
          events: [
            {
              id: "evt-101",
              name: "Stellar Summit",
              address: "Convention Center, Austin",
              location_area: "Downtown",
              description: "Annual Stellar ecosystem conference",
            },
          ],
        },
      });

      render(<EventsPage />);

      expect(mockUseQuery).toHaveBeenCalledWith(
        GET_EVENTS,
        expect.objectContaining({ fetchPolicy: "cache-and-network" }),
      );
      expect(screen.getByText("Stellar Summit")).toBeInTheDocument();
      expect(screen.getByText("Convention Center, Austin")).toBeInTheDocument();
      expect(screen.getByText("Downtown")).toBeInTheDocument();
      expect(
        screen.getByText("Annual Stellar ecosystem conference"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Coldplay Live")).not.toBeInTheDocument();
    });

    it("renders the loading state while GET_EVENTS is in flight", () => {
      mockUseQuery.mockReturnValue({
        loading: true,
        error: undefined,
        data: undefined,
      });

      render(<EventsPage />);
      expect(screen.getByText("Loading events...")).toBeInTheDocument();
    });

    it("renders the error state when GET_EVENTS fails", () => {
      mockUseQuery.mockReturnValue({
        loading: false,
        error: new Error("Hasura network failure"),
        data: undefined,
      });

      render(<EventsPage />);
      expect(screen.getByText("Failed to load events.")).toBeInTheDocument();
    });

    it("renders the empty state when no events are persisted", () => {
      mockUseQuery.mockReturnValue({
        loading: false,
        error: undefined,
        data: { events: [] },
      });

      render(<EventsPage />);
      expect(screen.getByText("No events yet.")).toBeInTheDocument();
    });
  });

  describe("EventDetailPage (detail)", () => {
    it("renders persisted event details from GET_EVENT_BY_ID", () => {
      mockUseQuery.mockReturnValue({
        loading: false,
        error: undefined,
        data: {
          events_by_pk: {
            id: "evt-101",
            name: "Meridian 2026",
            address: "Palacio de Congresos, Madrid",
            location_area: "Chamartín",
            description: "Global developer and fintech forum",
          },
        },
      });

      render(<EventDetailPage />);

      expect(mockUseQuery).toHaveBeenCalledWith(
        GET_EVENT_BY_ID,
        expect.objectContaining({ variables: { id: "evt-101" }, skip: false }),
      );
      expect(
        screen.getByRole("heading", { name: "Meridian 2026" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Palacio de Congresos, Madrid"),
      ).toBeInTheDocument();
      expect(screen.getByText("Chamartín")).toBeInTheDocument();
      expect(
        screen.getByText("Global developer and fintech forum"),
      ).toBeInTheDocument();
    });

    it("renders the loading state while GET_EVENT_BY_ID is loading", () => {
      mockUseQuery.mockReturnValue({
        loading: true,
        error: undefined,
        data: undefined,
      });

      render(<EventDetailPage />);
      expect(screen.getByText("Loading event...")).toBeInTheDocument();
    });

    it("renders the error state when GET_EVENT_BY_ID fails", () => {
      mockUseQuery.mockReturnValue({
        loading: false,
        error: new Error("GraphQL query error"),
        data: undefined,
      });

      render(<EventDetailPage />);
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Failed to load event",
      );
      expect(screen.getByText("GraphQL query error")).toBeInTheDocument();
    });

    it("renders the not-found state when events_by_pk is null", () => {
      mockUseQuery.mockReturnValue({
        loading: false,
        error: undefined,
        data: { events_by_pk: null },
      });

      render(<EventDetailPage />);
      expect(screen.getByText("Event not found")).toBeInTheDocument();
    });

    it("skips GET_EVENT_BY_ID when route id param is not yet available", () => {
      mockUseParams.mockReturnValue({});
      mockUseQuery.mockReturnValue({
        loading: false,
        error: undefined,
        data: undefined,
      });

      render(<EventDetailPage />);
      expect(mockUseQuery).toHaveBeenCalledWith(
        GET_EVENT_BY_ID,
        expect.objectContaining({ variables: { id: undefined }, skip: true }),
      );
    });
  });

  describe("NewEventPage (create)", () => {
    it("persists a new event via INSERT_EVENT and redirects to the events list", async () => {
      const insertEventMock = jest
        .fn()
        .mockResolvedValue({ data: { insert_events_one: { id: "evt-new-1" } } });
      mockUseMutation.mockReturnValue([insertEventMock, { loading: false }]);

      render(<NewEventPage />);

      fireEvent.change(screen.getByLabelText(/event name/i), {
        target: { value: "Soroban DevFest" },
      });
      fireEvent.change(screen.getByLabelText(/address/i), {
        target: { value: "Av. Central 40, San José" },
      });
      fireEvent.change(screen.getByLabelText(/location area/i), {
        target: { value: "San Pedro" },
      });
      fireEvent.change(screen.getByLabelText(/description/i), {
        target: { value: "Smart contract workshop" },
      });
      fireEvent.change(screen.getByLabelText(/latitude/i), {
        target: { value: "9.935" },
      });
      fireEvent.change(screen.getByLabelText(/longitude/i), {
        target: { value: "-84.051" },
      });

      fireEvent.click(screen.getByRole("button", { name: /create event/i }));

      await waitFor(() => {
        expect(mockUseMutation).toHaveBeenCalledWith(
          INSERT_EVENT,
          expect.objectContaining({
            refetchQueries: [{ query: GET_EVENTS }],
          }),
        );
        expect(insertEventMock).toHaveBeenCalledWith({
          variables: {
            object: {
              name: "Soroban DevFest",
              description: "Smart contract workshop",
              address: "Av. Central 40, San José",
              location_area: "San Pedro",
              owner_id: "user-uid-001",
              coordinates: {
                type: "Point",
                coordinates: [-84.051, 9.935],
              },
            },
          },
        });
        expect(mockToastSuccess).toHaveBeenCalledWith("Event created");
        expect(mockPush).toHaveBeenCalledWith("/dashboard/events");
      });
    });

    it("surfaces mutation failures without redirecting when INSERT_EVENT rejects", async () => {
      const insertEventMock = jest
        .fn()
        .mockRejectedValue(new Error("Hasura insert rejected"));
      mockUseMutation.mockReturnValue([insertEventMock, { loading: false }]);

      render(<NewEventPage />);

      fireEvent.change(screen.getByLabelText(/event name/i), {
        target: { value: "Failing Event" },
      });
      fireEvent.change(screen.getByLabelText(/address/i), {
        target: { value: "123 Main St" },
      });

      fireEvent.click(screen.getByRole("button", { name: /create event/i }));

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith(
          "Failed to create event. Please try again.",
        );
        expect(screen.getByRole("alert")).toHaveTextContent(
          "Failed to create event. Please try again.",
        );
      });
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("submits null coordinates when latitude or longitude inputs are cleared", async () => {
      const insertEventMock = jest
        .fn()
        .mockResolvedValue({ data: { insert_events_one: { id: "evt-new-2" } } });
      mockUseMutation.mockReturnValue([insertEventMock, { loading: false }]);

      render(<NewEventPage />);

      fireEvent.change(screen.getByLabelText(/event name/i), {
        target: { value: "Online Hackathon" },
      });
      fireEvent.change(screen.getByLabelText(/address/i), {
        target: { value: "Virtual" },
      });
      fireEvent.change(screen.getByLabelText(/latitude/i), {
        target: { value: "" },
      });
      fireEvent.change(screen.getByLabelText(/longitude/i), {
        target: { value: "" },
      });

      fireEvent.click(screen.getByRole("button", { name: /create event/i }));

      await waitFor(() => {
        expect(insertEventMock).toHaveBeenCalledWith({
          variables: {
            object: {
              name: "Online Hackathon",
              description: null,
              address: "Virtual",
              location_area: null,
              owner_id: "user-uid-001",
              coordinates: null,
            },
          },
        });
      });
    });
  });
});
