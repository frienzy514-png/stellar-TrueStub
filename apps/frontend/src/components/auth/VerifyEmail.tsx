"use client";

import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Buildings from "@/components/auth/ui/Buildings";
import LanguageSwitcher from "@/components/language/LanguageSwitcher";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useTranslation } from "react-i18next";

export default function VerifyEmail() {
  const { t } = useTranslation();

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4 z-10 flex items-center space-x-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex justify-center">
          <div className="bg-[#2857B8] p-3 rounded-full">
            <MailCheck className="h-10 w-10 text-white" />
          </div>
        </div>

        <h1 className="text-2xl font-bold">{t("auth.verifyEmailTitle")}</h1>
        <p className="text-gray-500 text-sm">
          {t("auth.verifyEmailSubtitle")}{" "}
          <span className="font-semibold text-black dark:text-white">user@example.com</span>
        </p>

        <div className="flex justify-center space-x-2">
          {Array(6)
            .fill("")
            .map((_, index) => (
              <Input
                key={index}
                className="w-12 h-12 text-center text-lg"
                maxLength={1}
              />
            ))}
        </div>

        <Button className="w-full bg-[#2857B8] hover:bg-[#2857B8]/90">
          {t("auth.resendCode")}
        </Button>
      </div>

      <Buildings />
    </div>
  );
}
