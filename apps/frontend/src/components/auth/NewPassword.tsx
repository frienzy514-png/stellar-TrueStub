"use client";

import { useState } from "react";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import Illustration from "@/components/auth/ui/Illustration";
import { PasswordStrengthMeter } from "@/components/auth/ui/PasswordStrengthMeter";

interface NewPasswordProps {
  /** Firebase oobCode extracted from the reset link URL (?oobCode=...) */
  oobCode: string;
}

export default function NewPassword({ oobCode }: NewPasswordProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setStatus("error");
      setMessage("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setStatus("error");
      setMessage("Password must be at least 8 characters long");
      return;
    }

    if (!oobCode) {
      setStatus("error");
      setMessage(
        "This link is invalid or has expired. Please request a new password reset."
      );
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      // Verify the oobCode is still valid before trying to confirm.
      // verifyPasswordResetCode throws if the code is expired or already used.
      await verifyPasswordResetCode(auth, oobCode);
      await confirmPasswordReset(auth, oobCode, password);
      setStatus("success");
      setMessage(
        "Password has been reset successfully. You can now sign in with your new password."
      );
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (
        code === "auth/expired-action-code" ||
        code === "auth/invalid-action-code"
      ) {
        setStatus("error");
        setMessage(
          "This reset link has expired or already been used. Please request a new one."
        );
      } else if (code === "auth/weak-password") {
        setStatus("error");
        setMessage("Password is too weak. Please choose a stronger password.");
      } else {
        setStatus("error");
        setMessage("Failed to reset password. Please try again.");
      }
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="flex w-full flex-col items-center justify-center px-4 md:w-1/2">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex items-center space-x-2">
            <Image
              src="/img/logo.png"
              alt="TrueStub"
              width={32}
              height={32}
              style={{ width: "auto", height: "auto" }}
            />
            <h1 className="text-2xl font-bold">TrueStub</h1>
          </div>

          <div className="space-y-2 text-center">
            <h2 className="text-xl font-semibold">Create New Password</h2>
            <p className="text-sm text-muted-foreground">
              Please enter your new password
            </p>
          </div>

          {status === "success" ? (
            <div className="space-y-4">
              <Alert>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
              <div className="text-center text-sm">
                <Link href="/login" className="text-[#2857B8] hover:underline">
                  Go to Login
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Enter new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
                {password && <PasswordStrengthMeter password={password} />}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>

              {message && status === "error" && (
                <Alert variant="destructive">
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                className="w-full bg-[#2857B8] hover:bg-[#2857B8]/90"
                disabled={status === "loading"}
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting Password...
                  </>
                ) : (
                  "Set New Password"
                )}
              </Button>

              <div className="text-center text-sm">
                <Link href="/login" className="text-[#2857B8] hover:underline">
                  Back to Login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>

      <Illustration />
    </div>
  );
}
