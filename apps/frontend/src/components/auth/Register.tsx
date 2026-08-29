"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { auth } from "@/lib/firebase";
import { useGlobalAuthenticationStore } from "@/core/store/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Illustration from "@/components/auth/ui/Illustration";
import {
  PasswordStrengthMeter,
  getPasswordScore,
} from "@/components/auth/ui/PasswordStrengthMeter";
import Cookies from "js-cookie";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import LanguageSwitcher from "@/components/language/LanguageSwitcher";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import zxcvbn from "zxcvbn";

const COUNTRY_CODES = [
  { code: "+506", country: "Costa Rica", flag: "🇨🇷" },
  { code: "+1",   country: "United States", flag: "🇺🇸" },
  { code: "+52",  country: "Mexico", flag: "🇲🇽" },
  { code: "+34",  country: "Spain", flag: "🇪🇸" },
  { code: "+44",  country: "United Kingdom", flag: "🇬🇧" },
  { code: "+49",  country: "Germany", flag: "🇩🇪" },
  { code: "+55",  country: "Brazil", flag: "🇧🇷" },
  { code: "+57",  country: "Colombia", flag: "🇨🇴" },
  { code: "+51",  country: "Peru", flag: "🇵🇪" },
  { code: "+54",  country: "Argentina", flag: "🇦🇷" },
];

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

export default function RegisterPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState("+506");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [passwordStrength, setPasswordStrength] = useState<number>(-1);

  const clearError = () => setError("");

  const getErrorMessage = (code: string) => {
    switch (code) {
      case "auth/email-already-in-use":
        return t("auth.emailInUse");
      case "auth/weak-password":
        return t("auth.weakPassword");
      case "auth/invalid-email":
        return t("auth.invalidEmail");
      default:
        return t("auth.unexpectedError");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    // Minimum strength gate — must be at least "Fair" (score >= 2)
    if (getPasswordScore(password) < 2) {
      toast.error(t("auth.passwordTooWeak"), { duration: 4000 });
      setError(t("auth.passwordTooWeak"));
      setIsLoading(false);
      return;
    }

    try {
      // Step 1 — create Firebase user
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );

      await updateProfile(credential.user, {
        displayName: `${firstName} ${lastName}`.trim(),
      });

      const token = await credential.user.getIdToken();

      // Step 2 — sync user to backend-TrueStub (non-blocking)
      try {
        await fetch("/api/auth/sync-user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            first_name: firstName,
            last_name: lastName,
            phone_number: phone,
            country_code: phoneCountryCode,
            location,
          }),
        });
      } catch {
        console.warn("User sync skipped — backend-TrueStub not available");
      }

      // Step 3 — set cookie and store token
      Cookies.set("firebase-token", token, {
        expires: 7,
        secure: true,
        sameSite: "strict",
      });

      useGlobalAuthenticationStore.getState().setToken(token);

      toast.success(t("auth.accountCreatedSuccess"), {
        description: t("auth.accountCreatedDesc"),
        duration: 4000,
      });

      router.push("/login");
    } catch (err: unknown) {
      if (err instanceof FirebaseError) {
        const msg = getErrorMessage(err.code);
        toast.error(msg, { duration: 4000 });
        setError(msg);
      } else {
        toast.error(t("auth.unexpectedError"), { duration: 4000 });
        setError(t("auth.registrationFailed"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="flex w-full flex-col items-center justify-center px-4 md:w-1/2">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex items-center justify-between w-full mb-2">
            <div className="flex items-center space-x-2">
              <Image src="/img/logo.png" alt="TrueStub" width={32} height={32} />
              <h1 className="text-2xl font-bold">TrueStub</h1>
            </div>
            <div className="flex items-center space-x-2">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </div>

          <form className="space-y-5 overflow-visible" onSubmit={handleRegister}>
            {/* First Name + Last Name */}
            <div className="flex gap-2">
              <div className="space-y-2 flex-1">
                <Label htmlFor="firstName">{t("auth.firstName")}</Label>
                <Input
                  id="firstName"
                  placeholder={t("auth.firstNamePlaceholder")}
                  required
                  value={firstName}
                  onChange={(e) => { setFirstName(e.target.value); clearError(); }}
                />
              </div>
              <div className="space-y-2 flex-1">
                <Label htmlFor="lastName">{t("auth.lastName")}</Label>
                <Input
                  id="lastName"
                  placeholder={t("auth.lastNamePlaceholder")}
                  required
                  value={lastName}
                  onChange={(e) => { setLastName(e.target.value); clearError(); }}
                />
              </div>
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="phone">{t("auth.phoneNumber")}</Label>
              <div className="flex gap-2">
                <Select
                  value={phoneCountryCode}
                  onValueChange={(v) => { setPhoneCountryCode(v); clearError(); }}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Code" />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={4}>
                    {COUNTRY_CODES.map(({ code, country, flag }) => (
                      <SelectItem key={code} value={code}>
                        {flag} {code} — {country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id="phone"
                  type="tel"
                  placeholder={t("auth.phonePlaceholder")}
                  required
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); clearError(); }}
                />
              </div>
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label htmlFor="location">{t("auth.location")}</Label>
              <Select
                value={location}
                onValueChange={(v) => { setLocation(v); clearError(); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("auth.selectLocation")} />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  <SelectItem value="cr">Costa Rica</SelectItem>
                  <SelectItem value="us">United States</SelectItem>
                  <SelectItem value="mx">Mexico</SelectItem>
                  <SelectItem value="es">Spain</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.emailOrUsername")}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t("auth.emailPlaceholder")}
                required
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearError(); }}
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t("auth.passwordPlaceholder")}
                required
                minLength={6}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordStrength(e.target.value ? zxcvbn(e.target.value).score : -1);
                  clearError();
                }}
              />
              <PasswordStrengthMeter password={password} />
            </div>

            <Button
              type="submit"
              className="w-full bg-[#2857B8] hover:bg-[#2857B8]/90"
              disabled={isLoading}
            >
              {isLoading ? t("auth.creatingAccount") : t("auth.signUpButton")}
            </Button>

            {error && (
              <p className="text-center text-sm text-red-600">{error}</p>
            )}
          </form>

          <div className="text-center text-sm">
            {t("auth.alreadyHaveAccount")}{" "}
            <Link href="/login" className="text-[#2857B8] hover:underline">
              {t("auth.signInLink")}
            </Link>
          </div>
        </div>
      </div>

      <Illustration />
    </div>
  );
}
