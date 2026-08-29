"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import zxcvbn from "zxcvbn";

const STRENGTH_LABELS = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];
const STRENGTH_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-yellow-500",
  "bg-lime-500",
  "bg-green-500",
];

function PasswordStrengthBar({ score }: { score: number }) {
  return (
    <div className="space-y-1" aria-label={`Password strength: ${STRENGTH_LABELS[score]}`}>
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              i <= score ? STRENGTH_COLORS[score] : "bg-gray-200 dark:bg-gray-700"
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{STRENGTH_LABELS[score]}</p>
    </div>
  );
}

interface ResetPasswordFormProps {
  onSubmit: (password: string, confirmPassword: string) => Promise<void>;
  isValidToken: boolean;
}

export default function ResetPasswordForm({
  onSubmit,
  isValidToken,
}: ResetPasswordFormProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStrength, setPasswordStrength] = useState<number>(-1);
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setStatus("error");
      setMessage(t("auth.passwordsDoNotMatch"));
      return;
    }

    if (password.length < 8) {
      setStatus("error");
      setMessage(t("auth.passwordMinLength"));
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      await onSubmit(password, confirmPassword);
      setStatus("success");
      setMessage(t("auth.passwordResetSuccess"));
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : t("auth.failedResetPassword"),
      );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2 text-left">
        <Label htmlFor="new-password">{t("auth.newPassword")}</Label>
        <Input
          id="new-password"
          type="password"
          placeholder="********"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setPasswordStrength(e.target.value ? zxcvbn(e.target.value).score : -1);
          }}
          required
          minLength={8}
        />
        {passwordStrength >= 0 && (
          <PasswordStrengthBar score={passwordStrength} />
        )}
      </div>

      <div className="space-y-2 text-left">
        <Label htmlFor="confirm-password">{t("auth.confirmPassword")}</Label>
        <Input
          id="confirm-password"
          type="password"
          placeholder="********"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
        />
      </div>

      {message && (
        <Alert variant={status === "error" ? "destructive" : "default"}>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        className="w-full bg-[#2857B8] hover:bg-[#2857B8]/90"
        disabled={status === "loading" || !isValidToken}
      >
        {status === "loading" ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("auth.resetting")}
          </>
        ) : (
          t("auth.resetPasswordButton")
        )}
      </Button>

      <div className="text-sm">
        <Link href="/login" className="text-[#2857B8] hover:underline">
          {t("auth.backToLogin")}
        </Link>
      </div>
    </form>
  );
}
