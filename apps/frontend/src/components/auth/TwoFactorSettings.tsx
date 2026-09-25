"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  onAuthStateChanged,
  multiFactor,
  TotpMultiFactorGenerator,
  type TotpSecret,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import QRCode from "react-qr-code";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth } from "@/lib/firebase";

export function TwoFactorSettings() {
  const { t } = useTranslation();
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [hasUser, setHasUser] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [totpSecret, setTotpSecret] = useState<TotpSecret | null>(null);
  const [qrUri, setQrUri] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setHasUser(!!user);
      setIsEnrolled(!!user && multiFactor(user).enrolledFactors.length > 0);
    });
  }, []);

  const describeError = (err: unknown) => {
    if (err instanceof FirebaseError) {
      if (err.code === "auth/invalid-verification-code") {
        return t("auth.twoFactor.invalidCode");
      }
      if (err.code === "auth/requires-recent-login") {
        return t("auth.twoFactor.requiresRecentLogin");
      }
    }
    return t("auth.twoFactor.genericError");
  };

  const startEnrollment = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setBusy(true);
    setError("");
    try {
      const session = await multiFactor(user).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(session);
      setTotpSecret(secret);
      setQrUri(secret.generateQrCodeUrl(user.email ?? user.uid, "TrueStub"));
      setEnrolling(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user || !totpSecret) return;

    setBusy(true);
    setError("");
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(totpSecret, code);
      await multiFactor(user).enroll(assertion, "Authenticator app");
      setIsEnrolled(true);
      setEnrolling(false);
      setTotpSecret(null);
      setCode("");
      toast.success(t("auth.twoFactor.enrollSuccess"));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const cancelEnrollment = () => {
    setEnrolling(false);
    setTotpSecret(null);
    setCode("");
    setError("");
  };

  const disableTwoFactor = async () => {
    const user = auth.currentUser;
    if (!user) return;
    if (!window.confirm(t("auth.twoFactor.disableConfirm"))) return;

    setBusy(true);
    setError("");
    try {
      const [factor] = multiFactor(user).enrolledFactors;
      if (factor) {
        await multiFactor(user).unenroll(factor);
      }
      setIsEnrolled(false);
      toast.success(t("auth.twoFactor.disableSuccess"));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t("auth.twoFactor.title")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("auth.twoFactor.description")}
          </p>
        </div>
        <span
          className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${
            isEnrolled
              ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
          }`}
        >
          {isEnrolled ? t("auth.twoFactor.statusEnabled") : t("auth.twoFactor.statusDisabled")}
        </span>
      </div>

      {!enrolling && (
        <div>
          {isEnrolled ? (
            <Button variant="outline" onClick={disableTwoFactor} disabled={busy}>
              {busy ? t("auth.twoFactor.disabling") : t("auth.twoFactor.disableButton")}
            </Button>
          ) : (
            <Button onClick={startEnrollment} disabled={busy || !hasUser}>
              {t("auth.twoFactor.enableButton")}
            </Button>
          )}
        </div>
      )}

      {enrolling && totpSecret && (
        <form onSubmit={confirmEnrollment} className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">{t("auth.twoFactor.step1Title")}</p>
            <p className="text-sm text-muted-foreground mb-3">
              {t("auth.twoFactor.step1Description")}
            </p>
            <div className="inline-block rounded-md border bg-white p-3">
              <QRCode value={qrUri} size={160} />
            </div>
            <div className="mt-3">
              <Label className="text-xs text-muted-foreground">
                {t("auth.twoFactor.manualKeyLabel")}
              </Label>
              <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-sm">
                {totpSecret.secretKey}
              </code>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="totp-code">{t("auth.twoFactor.codeLabel")}</Label>
            <Input
              id="totp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t("auth.twoFactor.codePlaceholder")}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              required
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <Button type="submit" disabled={busy || code.length !== 6}>
              {busy ? t("auth.twoFactor.verifying") : t("auth.twoFactor.verifyButton")}
            </Button>
            <Button type="button" variant="outline" onClick={cancelEnrollment} disabled={busy}>
              {t("auth.twoFactor.cancel")}
            </Button>
          </div>
        </form>
      )}

      {!enrolling && error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
