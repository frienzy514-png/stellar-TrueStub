"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchHeader } from "@/components/layouts/SearchHeader";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import LanguageSwitcher from "@/components/language/LanguageSwitcher";
import { useTranslation } from "react-i18next";
import { ConnectionStatus } from "@/components/notifications/ConnectionStatus";

interface HeaderProps {
  onMenuClick?: () => void;
}

export const Header = ({ onMenuClick }: HeaderProps) => {
  const { t } = useTranslation();
  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-white shadow-sm dark:border-b dark:border-gray-800 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex h-16 items-center gap-3 sm:gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={onMenuClick}
              >
                <Menu className="h-6 w-6" />
                <span className="sr-only">{t("header.toggleMenu")}</span>
              </Button>

              <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2">
                <Image
                  src="/img/logo.png"
                  alt="TrueStub Logo"
                  width={40}
                  height={40}
                  priority
                  className="h-9 w-9 shrink-0 object-contain"
                />
                <span className="hidden truncate text-xl font-semibold text-gray-800 dark:text-white sm:block">
                  TrueStub
                </span>
              </Link>
            </div>

            <div className="min-w-0 flex-1 max-w-2xl">
              <SearchHeader />
            </div>

            {/* Right: language | theme | bell | name | avatar */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <LanguageSwitcher />
              <ThemeToggle />

              <button
                type="button"
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label={t("header.notifications")}
              >
                <Bell className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>

              <button
                type="button"
                className="flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full px-2 py-1 transition-colors"
              >
                <span className="hidden md:block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Randall Valenciano
                </span>
                <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                    RV
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </header>
      {/* Spacer div to prevent content from being hidden under fixed header */}
      <div className="h-16" />
      {/* WebSocket connection status pill — hidden when connected */}
      <ConnectionStatus />
    </>
  );
};


export default Header;
