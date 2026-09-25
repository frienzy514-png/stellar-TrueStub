"use client";

import { useState } from "react";
import { User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  profileImageUrl?: string;
  reputation?: import("@/graphql/types").UserReputationSummary;
  reviews?: import("@/graphql/types").Review[];
}

interface UserProfileCardProps {
  user: UserProfile;
}

import { StarRating } from "@/components/ratings/StarRating";
import { UserReputationSummary } from "@/components/ratings/UserReputationSummary";
import { ReviewsList } from "@/components/ratings/ReviewsList";

export function UserProfileCard({ user }: UserProfileCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showReviews, setShowReviews] = useState(false);
  const [formData, setFormData] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    phoneNumber: user.phoneNumber,
    profileImageUrl: user.profileImageUrl ?? "",
  });

  const reputation = user.reputation || {
    user_id: user.id,
    total_reviews: 32,
    average_rating: 4.9,
    five_star_count: 29,
    four_star_count: 3,
    three_star_count: 0,
    two_star_count: 0,
    one_star_count: 0,
    positive_percentage: 100,
  };

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSave() {
    console.log("Updated profile values:", formData);
    // TODO: replace with useMutation(UPDATE_USER) in GraphQL wiring issue
    setIsEditing(false);
  }

  function handleCancel() {
    setFormData({
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      profileImageUrl: user.profileImageUrl ?? "",
    });
    setIsEditing(false);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          My Profile & Reputation
        </CardTitle>
        <button
          type="button"
          onClick={() => setShowReviews(!showReviews)}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
        >
          {showReviews ? "Hide Reviews" : "View Feedback History"}
        </button>
      </CardHeader>
      <CardContent className="space-y-6">
        {isEditing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleChange}
                placeholder="+1 234 567 8900"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="profileImageUrl">Profile Image URL</Label>
              <Input
                id="profileImageUrl"
                name="profileImageUrl"
                value={formData.profileImageUrl}
                onChange={handleChange}
                placeholder="https://example.com/avatar.png"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white">
                Save
              </Button>
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted">
                {formData.profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={formData.profileImageUrl}
                    alt="Profile"
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <User className="h-7 w-7 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-base">
                    {formData.firstName} {formData.lastName}
                  </p>
                  <StarRating
                    rating={reputation.average_rating}
                    size="sm"
                    showNumber={true}
                    reviewCount={reputation.total_reviews}
                  />
                </div>
                <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                <p className="text-sm text-muted-foreground">{formData.phoneNumber}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="shrink-0"
              >
                Edit Profile
              </Button>
            </div>
          </div>
        )}

        {/* Reputation Score and breakdown */}
        <UserReputationSummary reputation={reputation} />

        {/* Reviews list (collapsible or displayed) */}
        {showReviews && (
          <div className="pt-2 border-t">
            <ReviewsList reviews={user.reviews} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

