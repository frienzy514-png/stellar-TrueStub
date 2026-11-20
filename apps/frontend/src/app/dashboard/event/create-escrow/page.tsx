"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TicketEscrowWrapper } from "@/components/ticket-listing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/language/LanguageSwitcher";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

function EscrowLifecycleHarness() {
  const [step, setStep] = useState("ready");
  const advance = async (name: string, next: string) => {
    await fetch(`/api/trustless-work/${name}`, { method: "POST" }).catch(() => undefined);
    setStep(next);
  };
  return <Card className="w-full max-w-md" data-testid="escrow-lifecycle-harness">
    <CardHeader><CardTitle>Escrow lifecycle test harness</CardTitle><CardDescription>Deterministic wallet/API seam for Cypress only.</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      <p data-testid="escrow-status" className="font-medium">Status: {step}</p>
      {step === "ready" && <Button onClick={() => void advance("create", "created")}>Create Escrow</Button>}
      {step === "created" && <Button onClick={() => void advance("fund", "funded")}>Fund Escrow</Button>}
      {step === "funded" && <Button onClick={() => void advance("transfer", "transfer_confirmed")}>Confirm Transfer</Button>}
      {step === "transfer_confirmed" && <Button onClick={() => void advance("release", "completed")}>Release Funds</Button>}
      {step === "completed" && <p className="text-green-600">Escrow completed</p>}
    </CardContent>
  </Card>;
}

/**
 * Create Escrow Page
 *
 * Route: /dashboard/event/create-escrow
 *
 * Simple page for users to create an escrow by entering a purchase ID.
 * In production, users would typically arrive here from the purchase flow.
 */
export default function CreateEscrowPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [purchaseId, setPurchaseId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [testHarness, setTestHarness] = useState(false);

  useEffect(() => setTestHarness(new URLSearchParams(window.location.search).get("e2e") === "1"), []);

  if (testHarness) {
    return <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4"><EscrowLifecycleHarness /></div>;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (purchaseId.trim()) {
      setShowForm(true);
    }
  };

  if (showForm && purchaseId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-6 flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => {
                setShowForm(false);
                setPurchaseId("");
              }}
            >
              ← {t("escrow.back")}
            </Button>
            <div className="flex items-center space-x-2">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </div>
          <TicketEscrowWrapper
            purchaseId={purchaseId}
            onComplete={() => router.push("/dashboard")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
      <div className="absolute top-4 right-4 flex items-center space-x-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("escrow.createTitle")}</CardTitle>
          <CardDescription>
            {t("escrow.createSubtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="purchaseId">{t("escrow.purchaseId")}</Label>
              <Input
                id="purchaseId"
                placeholder={t("escrow.purchaseIdPlaceholder")}
                value={purchaseId}
                onChange={(e) => setPurchaseId(e.target.value)}
                required
              />
              <p className="text-xs text-slate-500">
                {t("escrow.purchaseIdHelp")}
              </p>
            </div>
            <Button type="submit" className="w-full">
              {t("escrow.continueToEscrow")}
            </Button>
          </form>
          
          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-500 text-center">
              {t("escrow.securedNote")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
