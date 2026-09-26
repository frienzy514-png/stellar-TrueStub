import { ListingAlertService, searchMatchesListing } from "./listing-alert.service";
import { NotificationService } from "./notification.service";
import { HasuraService } from "./hasura.service";

const listing = { id: "L1", eventName: "Coldplay: Music of the Spheres", price: 300, section: "West Floor" };

describe("ListingAlertService", () => {
  let service: ListingAlertService;
  let notify: jest.SpyInstance;

  beforeEach(() => {
    service = new ListingAlertService();
    notify = jest
      .spyOn(NotificationService, "notifyListingAlert")
      .mockResolvedValue({ emailSent: true, pushSent: false, channel: "email", timestamp: "" });
    jest.spyOn(HasuraService, "insertNotification").mockResolvedValue(true);
  });

  describe("saved searches (#187)", () => {
    it("matches on event, price ceiling and section", () => {
      const s = service.createSearch({ userId: "u1", eventName: "coldplay", maxPrice: 350, section: "floor" });
      expect(searchMatchesListing(s, listing)).toBe(true);
      expect(searchMatchesListing({ ...s, maxPrice: 250 }, listing)).toBe(false);
      expect(searchMatchesListing({ ...s, section: "balcony" }, listing)).toBe(false);
      expect(searchMatchesListing({ ...s, eventName: "hamilton" }, listing)).toBe(false);
    });

    it("notifies only matching searches when a listing is created", async () => {
      const hit = service.createSearch({ userId: "u1", eventName: "Coldplay", maxPrice: 400, email: "a@b.co" });
      service.createSearch({ userId: "u2", eventName: "Coldplay", maxPrice: 100 });
      const ids = await service.notifyNewListing(listing);
      expect(ids).toEqual([hit.id]);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(HasuraService.insertNotification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "u1", type: "listing_match" })
      );
    });

    it("only lets the owner delete a search", () => {
      const s = service.createSearch({ userId: "u1", eventName: "x" });
      expect(service.deleteSearch(s.id, "u2")).toBe(false);
      expect(service.deleteSearch(s.id, "u1")).toBe(true);
    });
  });

  describe("watchlist (#189)", () => {
    beforeEach(() => {
      service.watch({ userId: "u1", listingId: "L1" });
      service.watch({ userId: "u2", listingId: "OTHER" });
    });

    it("notifies watchers on a price change", async () => {
      const r = await service.notifyListingUpdate({ ...listing, price: 250 }, 300);
      expect(r.priceChange).toEqual(["u1"]);
      expect(r.aboutToSell).toEqual([]);
    });

    it("notifies watchers when the listing is about to sell", async () => {
      const r = await service.notifyListingUpdate({ ...listing, status: "reserved" }, 300);
      expect(r.aboutToSell).toEqual(["u1"]);
      expect(r.priceChange).toEqual([]);
    });

    it("stays quiet when nothing relevant changed", async () => {
      const r = await service.notifyListingUpdate({ ...listing, status: "active" }, 300);
      expect(r).toEqual({ priceChange: [], aboutToSell: [] });
      expect(notify).not.toHaveBeenCalled();
    });
  });
});
