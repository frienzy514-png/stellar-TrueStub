"use client";

import { Plus, User, Settings, CreditCard, FileText, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';

interface QuickActionsProps {
  userRole: 'guest' | 'event' | 'admin';
}

export function QuickActions({ userRole }: QuickActionsProps) {
  const router = useRouter();
  const { t } = useTranslation();

  const guestActions = [
    {
      title: t('dashboard.newBooking'),
      icon: Plus,
      onClick: () => router.push('/book'),
      description: t('dashboard.newBookingDesc'),
    },
    {
      title: t('dashboard.myProfile'),
      icon: User,
      onClick: () => router.push('/profile'),
      description: t('dashboard.myProfileDesc'),
    },
    {
      title: t('dashboard.paymentMethods'),
      icon: CreditCard,
      onClick: () => router.push('/payment-methods'),
      description: t('dashboard.paymentMethodsDesc'),
    },
  ];

  const eventActions = [
    {
      title: t('dashboard.addProperty'),
      icon: Plus,
      onClick: () => router.push('/event/properties/add'),
      description: t('dashboard.addPropertyDesc'),
    },
    {
      title: t('dashboard.manageBookings'),
      icon: FileText,
      onClick: () => router.push('/event/bookings'),
      description: t('dashboard.manageBookingsDesc'),
    },
    {
      title: t('dashboard.eventSettings'),
      icon: Settings,
      onClick: () => router.push('/event/settings'),
      description: t('dashboard.eventSettingsDesc'),
    },
  ];

  const adminActions = [
    {
      title: t('dashboard.manageEscrows'),
      icon: FileText,
      onClick: () => router.push('/admin/escrows'),
      description: t('dashboard.manageEscrowsDesc'),
    },
    {
      title: t('dashboard.userManagement'),
      icon: User,
      onClick: () => router.push('/admin/users'),
      description: t('dashboard.userManagementDesc'),
    },
    {
      title: t('dashboard.systemSettings'),
      icon: Settings,
      onClick: () => router.push('/admin/settings'),
      description: t('dashboard.systemSettingsDesc'),
    },
  ];

  const actions =
    userRole === 'guest'
      ? guestActions
      : userRole === 'event'
        ? eventActions
        : adminActions;

  const helpAction = {
    title: t('dashboard.getHelp'),
    icon: HelpCircle,
    onClick: () => router.push('/support'),
    description: t('dashboard.getHelpDesc'),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium dark:text-white">
          {t('dashboard.quickActions')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          {actions.map((action, index) => (
            <Button
              key={index}
              variant="outline"
              className="w-full justify-start h-auto py-3 px-4 dark:border-gray-700 dark:hover:bg-gray-800"
              onClick={action.onClick}
            >
              <div className="flex items-center space-x-3">
                <div className="p-1.5 rounded-md bg-primary/10 text-primary dark:bg-primary/20">
                  <action.icon className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <div className="font-medium dark:text-white">{action.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {action.description}
                  </div>
                </div>
              </div>
            </Button>
          ))}
        </div>
        <div className="border-t dark:border-gray-700 pt-4">
          <Button
            variant="ghost"
            className="w-full justify-start h-auto py-3 px-4 dark:hover:bg-gray-800"
            onClick={helpAction.onClick}
          >
            <div className="flex items-center space-x-3">
              <div className="p-1.5 rounded-md bg-muted dark:bg-gray-800">
                <helpAction.icon className="h-4 w-4" />
              </div>
              <div className="text-left">
                <div className="font-medium dark:text-white">{helpAction.title}</div>
                <div className="text-xs text-muted-foreground">
                  {helpAction.description}
                </div>
              </div>
            </div>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
