"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, DollarSign, Home, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type LeftField = {
  id: string;
  label: string;
  icon: React.ElementType;
  value: string;
  set: (value: string) => void;
  type: string;
};

const ROOM_OPTIONS = ["1", "2", "3", "4", "5"];
const BATH_OPTIONS = ["1", "2", "3", "4"];
const PROMOTION_OPTIONS = ["0", "5", "10", "15", "20", "25"];

export function NewListingForm() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [amount, setAmount] = useState("");
  const [promotion, setPromotion] = useState("0");
  const [details, setDetails] = useState("");
  const [rooms, setRooms] = useState("1");
  const [baths, setBaths] = useState("1");
  const [petFriendly, setPetFriendly] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Multi-ticket / bundle listing fields
  const [ticketQuantity, setTicketQuantity] = useState("1");
  const [allowPartialPurchase, setAllowPartialPurchase] = useState(false);
  const [bundlePrice, setBundlePrice] = useState("");

  const parsedQuantity = Math.max(1, parseInt(ticketQuantity, 10) || 1);
  const parsedUnitPrice = parseFloat(amount) || 0;
  const parsedBundlePrice = bundlePrice ? parseFloat(bundlePrice) : undefined;
  const isBundle = parsedQuantity > 1;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);

    try {
      // TODO: Replace with actual API call
      const payload = {
        name,
        location,
        pricePerUnit: parsedUnitPrice,
        ticketQuantity: parsedQuantity,
        allowPartialPurchase: isBundle ? allowPartialPurchase : false,
        bundlePrice: isBundle ? parsedBundlePrice : undefined,
        promotion,
        details,
        rooms,
        baths,
        petFriendly,
      };
      await new Promise((resolve) => setTimeout(resolve, 800));
      console.log("New listing submitted:", payload);
      router.push("/dashboard/listings");
    } finally {
      setIsLoading(false);
    }
  };

  const leftFields: LeftField[] = [
    {
      id: "apt-name",
      label: "Listing name",
      icon: Home,
      value: name,
      set: setName,
      type: "text",
    },
    {
      id: "apt-location",
      label: "Location",
      icon: MapPin,
      value: location,
      set: setLocation,
      type: "text",
    },
    {
      id: "apt-amount",
      label: "Price per ticket",
      icon: DollarSign,
      value: amount,
      set: setAmount,
      type: "number",
    },
  ];

  return (
    <form onSubmit={handleSubmit}>
      <h1 className="mb-8 text-2xl font-bold text-gray-900 dark:text-gray-100">
        New listing
      </h1>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="space-y-5">
          {leftFields.map(({ id, label, icon: Icon, value, set, type }) => (
            <div key={id} className="space-y-1.5">
              <Label htmlFor={id}>{label}</Label>
              <div className="relative">
                <div className="absolute left-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md bg-orange-100">
                  <Icon className="h-4 w-4 text-orange-500" />
                </div>
                <Input
                  id={id}
                  type={type}
                  className="pl-11"
                  value={value}
                  onChange={(event) => set(event.target.value)}
                  required
                />
              </div>
            </div>
          ))}

          <div className="space-y-1.5">
            <Label htmlFor="apt-promotion">Promotion percent</Label>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-orange-100">
                <Clock className="h-4 w-4 text-orange-500" />
              </div>
              <Select value={promotion} onValueChange={setPromotion}>
                <SelectTrigger id="apt-promotion" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROMOTION_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ticket-quantity">Number of tickets</Label>
            <Input
              id="ticket-quantity"
              type="number"
              min={1}
              step={1}
              className="w-28"
              value={ticketQuantity}
              onChange={(event) => setTicketQuantity(event.target.value)}
              required
            />
          </div>

          {isBundle && (
            <div className="space-y-3 rounded-md border border-orange-200 bg-orange-50/50 p-4 dark:border-gray-600 dark:bg-gray-800/50">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="allow-partial-purchase"
                  checked={allowPartialPurchase}
                  onCheckedChange={(checked) => setAllowPartialPurchase(Boolean(checked))}
                  className="border-orange-400 data-[state=checked]:border-orange-500 data-[state=checked]:bg-orange-500"
                />
                <Label htmlFor="allow-partial-purchase">
                  Allow buyers to purchase individual tickets
                </Label>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bundle-price">
                  Full bundle price (optional discount)
                </Label>
                <Input
                  id="bundle-price"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={`Defaults to ${parsedQuantity} x $${parsedUnitPrice || 0}`}
                  value={bundlePrice}
                  onChange={(event) => setBundlePrice(event.target.value)}
                />
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                {allowPartialPurchase
                  ? `Buyers can purchase 1-${parsedQuantity} ticket(s) at $${parsedUnitPrice || 0} each.`
                  : `Buyers must purchase all ${parsedQuantity} tickets together${
                      parsedBundlePrice ? ` for $${parsedBundlePrice}` : ""
                    }.`}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="apt-rooms">Rooms</Label>
              <Select value={rooms} onValueChange={setRooms}>
                <SelectTrigger id="apt-rooms" className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROOM_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="apt-baths">Bathrooms</Label>
              <Select value={baths} onValueChange={setBaths}>
                <SelectTrigger id="apt-baths" className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BATH_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 pb-0.5">
              <Checkbox
                id="apt-pet"
                checked={petFriendly}
                onCheckedChange={(checked) => setPetFriendly(Boolean(checked))}
                className="border-orange-400 data-[state=checked]:border-orange-500 data-[state=checked]:bg-orange-500"
              />
              <Label htmlFor="apt-pet">Pet friendly</Label>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="apt-details">Listing details</Label>
            <Textarea
              id="apt-details"
              rows={6}
              className="resize-none focus-visible:ring-orange-400"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Images</Label>
            <div className="grid grid-cols-3 gap-2">
              <label
                htmlFor="apt-img-main"
                className="col-span-2 flex h-44 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-colors hover:border-orange-400"
              >
                <input
                  id="apt-img-main"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                />
                <Plus className="h-6 w-6 text-gray-400" />
              </label>

              <div className="flex flex-col gap-2">
                {[1, 2, 3].map((slot) => (
                  <label
                    key={slot}
                    htmlFor={`apt-img-${slot}`}
                    className="flex flex-1 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-colors hover:border-orange-400"
                  >
                    <input
                      id={`apt-img-${slot}`}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                    />
                    <Plus className="h-4 w-4 text-gray-400" />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <Button
          type="submit"
          disabled={isLoading}
          className="w-full bg-orange-500 py-3 text-base font-semibold text-white hover:bg-orange-600"
        >
          {isLoading ? "Registering..." : "Regist"}
        </Button>
      </div>
    </form>
  );
}