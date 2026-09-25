"use client";

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const LANGUAGES = [
  { code: "en", name: "English", flag: "🇺🇸", label: "EN" },
  { code: "es", name: "Español", flag: "🇪🇸", label: "ES" },
];

export default function LanguageSwitcher({
  variant = "ghost",
  className = "",
}: {
  variant?: "ghost" | "outline" | "default";
  className?: string;
}) {
  const { i18n } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentLang =
    LANGUAGES.find((lang) => lang.code === (i18n.language?.split("-")[0] || "en")) ||
    LANGUAGES[0];

  const handleLanguageChange = (code: string) => {
    // Persisted to localStorage by the languageChanged listener in i18n/config.
    i18n.changeLanguage(code);
  };

  if (!mounted) {
    return (
      <Button
        variant={variant}
        size="sm"
        className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium ${className}`}
        aria-label="Change language"
      >
        <Globe className="h-4 w-4" />
        <span>EN</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size="sm"
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium ${className}`}
          aria-label="Select language"
        >
          <Globe className="h-4 w-4" />
          <span>{currentLang.label}</span>
          <span className="sr-only">{currentLang.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className={`flex items-center justify-between cursor-pointer text-xs ${
              currentLang.code === lang.code ? "font-semibold bg-accent" : ""
            }`}
          >
            <span className="flex items-center gap-2">
              <span>{lang.flag}</span>
              <span>{lang.name}</span>
            </span>
            <span className="text-muted-foreground text-[10px] uppercase">
              {lang.code}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
