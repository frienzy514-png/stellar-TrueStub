"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import NewPassword from "@/components/auth/NewPassword";

function NewPasswordContent() {
  const searchParams = useSearchParams();
  const oobCode = searchParams.get("oobCode") ?? "";

  return <NewPassword oobCode={oobCode} />;
}

export default function Page() {
  return (
    <Suspense>
      <NewPasswordContent />
    </Suspense>
  );
}
