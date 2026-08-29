import { EditProfileForm } from "@/components/dashboard/profile/EditProfileForm";
import { PrivacyDataSection } from "@/components/dashboard/profile/PrivacyDataSection";
import { ProfileSettingsSidebar } from "@/components/dashboard/profile/ProfileSettingsSidebar";

export default function ProfilePage() {
  return (
    <div className="flex w-full bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden dark:bg-gray-900 dark:border-gray-700">
      <ProfileSettingsSidebar />
      <div className="flex-1 min-w-0 p-6 lg:p-8 space-y-8">
        <EditProfileForm />
        <PrivacyDataSection />
      </div>
    </div>
  );
}
