import { ConnectedWalletSection } from "@/components/dashboard/profile/ConnectedWalletSection";
import { EditProfileForm } from "@/components/dashboard/profile/EditProfileForm";
import { NotificationPreferences } from "@/components/dashboard/profile/NotificationPreferences";
import { PrivacyDataSection } from "@/components/dashboard/profile/PrivacyDataSection";
import { ProfileSettingsSidebar } from "@/components/dashboard/profile/ProfileSettingsSidebar";

/**
 * Profile management: edit name, avatar, bio and contact details
 * (EditProfileForm), view the connected Stellar wallet, choose which email
 * notifications to receive, and export or delete account data.
 */
export default function ProfilePage() {
  return (
    <div className="flex w-full bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden dark:bg-gray-900 dark:border-gray-700">
      <ProfileSettingsSidebar />
      <div className="flex-1 min-w-0 p-6 lg:p-8 space-y-8">
        <EditProfileForm />
        <ConnectedWalletSection />
        <NotificationPreferences />
        <PrivacyDataSection />
      </div>
    </div>
  );
}
