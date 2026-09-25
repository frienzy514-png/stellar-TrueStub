"use client";

export const dynamic = 'force-dynamic';

import { useState } from "react";
import EventPhotos from "@/components/ticket-listing/EventPhotos";
import TicketListingDetails, { TicketListingDetailsInfo } from "@/components/ticket-listing/TicketListingDetails";
import AditionalEventPhotos from "@/components/ticket-listing/AdditionalEventPhotos";
import { TicketListingCard } from "@/components/ticket-listing/TicketListingCard";
import { PurchaseConfirmation } from "@/components/ticket-listing/PurchaseConfirmation";
import {
  TicketListingDetailsCard,
  TicketActionBar,
  MobileTicketGallery,
  MobilePurchaseCard,
} from "./components";
import {
  AmenitiesCard,
  LocationCard,
  HostCard,
  PolicyCard,
} from "@/components/ticket-listing/cards";
import { useRouter } from "next/navigation";
import { NavigationHeader } from "@/components/navigation/NavigationHeader";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share, Heart } from "lucide-react";

const additionalImages = [
  "/img/room1.png",
  "/img/room2.png",
  "/img/event/event1.jpg",
];

const breadcrumbs = [
  { label: "Search", href: "/dashboard/search" },
  { label: "Shikara Event", isCurrentPage: true },
];

export default function RoomPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [mobileBookingOpen, setMobileBookingOpen] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(24);

  // Simulated auth state
  const isAuthenticated = false;

  const handleLike = () => {
    if (!isAuthenticated) {
      alert("Please login to save this room");
      return;
    }
    setIsLiked(!isLiked);
    setLikeCount((prev) => (isLiked ? prev - 1 : prev + 1));
  };

  const handleContact = () => {
    if (!isAuthenticated) {
      alert("Please login to contact the host");
      return;
    }
    console.log("Contact form opened");
  };

  const handleReport = () => {
    if (!isAuthenticated) {
      alert("Please login to report this listing");
      return;
    }
    console.log("Report form opened");
  };

  const [purchaseData, setBookingData] = useState<{
    purchaseId: string;
    transferInitiated: Date;
    transferCompleted: Date;
    guestCount: number;
    totalPrice: number;
  } | null>(null);

  const handleBookingStart = () => {
    setIsBooking(true);
    console.log("Booking process started");
  };

  const handleBookingClick = () => {
    setMobileBookingOpen(true);
  };

  const handleBookingComplete = (purchaseId: string) => {
    setIsBooking(false);
    console.log("Booking completed:", purchaseId);

    setBookingData({
      purchaseId,
      transferInitiated: new Date(),
      transferCompleted: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      guestCount: 1,
      totalPrice: 120.54,
    });
  };

  const handleBookingError = (error: string) => {
    setIsBooking(false);
    console.error("Booking error:", error);
  };

  const handleViewBooking = () => {
    if (purchaseData) {
      router.push(
        `/dashboard/event/payment?purchaseId=${purchaseData.purchaseId}`,
      );
    }
  };

  const detailsInfo: TicketListingDetailsInfo = {
    eventName: "Shikara Event",
    address: "124 Colte Street, Downtown Center, San José",
    beds: 2,
    baths: 1,
    mapImageSrc: "/img/image 16.png?height=195&width=300",
    detailsDescription:
      "Lorem ipsum is simply random text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s.",
    payment: {
      priceLabel: "$40.18 / night",
      locationTag: "Limón",
      propertyTitle: "Puerto Viejo House",
      monthlyAmount: 18000,
      occupancyTaxes: 200,
      totalPerMonth: 18200,
      depositAmount: 14000,
      billingDescription:
        "Lorem Ipsum is simply dummy text of the printing and typesetting industry.",
      depositStatusText:
        "Lorem Ipsum is simply dummy text of the printing and typesetting industry.",
      rentalStatusText:
        "Lorem Ipsum is simply dummy text of the printing and typesetting industry.",
    },
  };

  return (
    <div className="container mx-auto pb-8 max-w-7xl min-h-screen bg-background">
      {/* Navigation/Page Header */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <NavigationHeader
          breadcrumbs={breadcrumbs}
          backButtonFallback="/search"
        />
      </div>

      {/* Main content */}
      <h1 className="px-4 md:px-6 text-2xl font-bold my-4 lg:mb-6">
        Room Gallery
      </h1>

      {/* 1. Photo Gallery Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        {/* Main Room Photos */}
        <div className="lg:col-span-8 space-y-6 px-2 md:px-6">
          <EventPhotos />
        </div>

        {/* Additional Event Images */}
        <div className="lg:col-span-4">
          <AditionalEventPhotos images={additionalImages} />
        </div>
      </div>

      {/* 2. Room Information Section */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Main content - Room Details */}
        <div className="xl:col-span-2 space-y-8">
          {/* Room Basic Details */}
          <TicketListingDetailsCard isLoading={isLoading} />
          {/* Action Bar */}
          <TicketActionBar
            isLiked={isLiked}
            likeCount={likeCount}
            onLike={handleLike}
            onContact={handleContact}
            onReport={handleReport}
          />
          {/* Amenities */}
          <AmenitiesCard isLoading={isLoading} />
          {/* Location */}
          <LocationCard isLoading={isLoading} />
          {/* Host Information */}
          <HostCard isLoading={isLoading} />
          {/* Policies and Rules */}
          <PolicyCard isLoading={isLoading} />
        </div>

        {/* Sidebar - Booking Card */}
        <div className="xl:col-span-1">
          <div className="hidden xl:block sticky top-24">
            <div className="lg:col-span-4">
              {purchaseData ? (
                <PurchaseConfirmation
                  purchaseId={purchaseData.purchaseId}
                  eventName="Shikara Event"
                  transferInitiated={purchaseData.transferInitiated}
                  transferCompleted={purchaseData.transferCompleted}
                  guestCount={purchaseData.guestCount}
                  totalPrice={purchaseData.totalPrice}
                  onViewBooking={handleViewBooking}
                />
              ) : (
                <TicketListingCard
                  listingId="room_001"
                  basePrice={2}
                  onBookingStart={handleBookingStart}
                  onBookingComplete={handleBookingComplete}
                  onBookingError={handleBookingError}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Mobile Modals */}
      {/* <MobileTicketGallery
          images={roomImages}
          isOpen={mobileGalleryOpen}
          onClose={() => setMobileGalleryOpen(false)}
          initialImageIndex={selectedImageIndex}
        /> */}
      <MobilePurchaseCard
        isOpen={mobileBookingOpen}
        onClose={() => setMobileBookingOpen(false)}
      />
    </div>
  );
}
