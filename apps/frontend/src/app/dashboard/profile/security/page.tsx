import { TwoFactorSettings } from "@/components/auth/TwoFactorSettings";
import { ProfileSettingsSidebar } from "@/components/dashboard/profile/ProfileSettingsSidebar";

export default function ProfileSecurityPage() {
  return (
    <div className="flex w-full bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden dark:bg-gray-900 dark:border-gray-700">
      <ProfileSettingsSidebar />
      <div className="flex-1 min-w-0 p-6 lg:p-8">
        <h1 className="text-2xl font-semibold mb-4">Security</h1>
        <TwoFactorSettings />
      </div>
    </div>
  );
}
