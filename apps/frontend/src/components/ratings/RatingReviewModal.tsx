"use client";

import { useState } from "react";
import { StarRating } from "./StarRating";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CheckCircle2, MessageSquare, Star } from "lucide-react";

interface RatingReviewModalProps {
  escrowId: string;
  reviewerId: string;
  reviewerName?: string;
  revieweeId: string;
  revieweeName: string;
  role: "buyer" | "seller" | "tenant" | "owner";
  onSubmitReview?: (reviewData: {
    escrowId: string;
    reviewerId: string;
    reviewerName?: string;
    revieweeId: string;
    rating: number;
    comment: string;
    role: string;
  }) => Promise<void> | void;
  triggerButton?: React.ReactNode;
}

export function RatingReviewModal({
  escrowId,
  reviewerId,
  reviewerName = "User",
  revieweeId,
  revieweeName,
  role,
  onSubmitReview,
  triggerButton,
}: RatingReviewModalProps) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) return;

    setIsSubmitting(true);
    try {
      if (onSubmitReview) {
        await onSubmitReview({
          escrowId,
          reviewerId,
          reviewerName,
          revieweeId,
          rating,
          comment,
          role,
        });
      }
      setIsSubmitted(true);
      setTimeout(() => {
        setIsSubmitted(false);
        setOpen(false);
        setComment("");
      }, 1500);
    } catch (err) {
      console.error("Failed to submit review:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerButton || (
          <Button variant="outline" className="gap-2 border-yellow-500/50 hover:bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
            Rate & Review {role === "buyer" || role === "tenant" ? "Seller" : "Buyer"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        {isSubmitted ? (
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 animate-in zoom-in-50 duration-300" />
            <h3 className="text-xl font-semibold">Thank you for your feedback!</h3>
            <p className="text-sm text-muted-foreground">
              Your rating has been recorded and added to {revieweeName}&apos;s reputation.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader className="space-y-2">
              <DialogTitle className="text-xl">
                Rate your transaction with {revieweeName}
              </DialogTitle>
              <DialogDescription>
                Your feedback helps build trust and reputation in the TrueStub peer-to-peer resale network.
              </DialogDescription>
            </DialogHeader>

            <div className="py-6 space-y-6">
              <div className="flex flex-col items-center justify-center space-y-2 bg-muted/40 p-4 rounded-xl">
                <Label className="text-sm font-medium text-muted-foreground">
                  Overall Experience
                </Label>
                <StarRating
                  rating={rating}
                  interactive={true}
                  onChange={setRating}
                  size="lg"
                />
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {rating === 5 && "⭐ Excellent"}
                  {rating === 4 && "👍 Good"}
                  {rating === 3 && "👌 Average"}
                  {rating === 2 && "👎 Poor"}
                  {rating === 1 && "⚠️ Terrible"}
                </span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="comment" className="flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Written Review <span className="text-xs text-muted-foreground">(Optional)</span>
                </Label>
                <Textarea
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={`Share details about your experience with ${revieweeName} (e.g. ticket delivery speed, communication, trustworthiness)...`}
                  className="min-h-[100px] resize-y"
                  maxLength={500}
                />
                <div className="flex justify-end text-xs text-muted-foreground">
                  {comment.length}/500
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSubmitting ? "Submitting..." : "Submit Review"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
