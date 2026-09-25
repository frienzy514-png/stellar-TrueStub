"use client";

import { Bell, BellRing, Menu, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { NotificationData } from './RoleEscrowDashboard';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '@/components/language/LanguageSwitcher';

interface DashboardHeaderProps {
  userRole: 'guest' | 'event' | 'admin';
  notifications: NotificationData[];
  onMenuClick?: () => void;
  showAnalytics?: boolean;
  onToggleAnalytics?: () => void;
}

export function DashboardHeader({
  userRole,
  notifications = [],
  onMenuClick,
  showAnalytics = false,
  onToggleAnalytics,
}: DashboardHeaderProps) {
  const { t } = useTranslation();
  const unreadCount = notifications.filter(n => !n.read).length;
  
  const getRoleLabel = (role: 'guest' | 'event' | 'admin') => {
    switch (role) {
      case 'guest': return t('dashboard.roleGuest');
      case 'event': return t('dashboard.roleEvent');
      case 'admin': return t('dashboard.roleAdmin');
    }
  };

  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <Button 
          variant="ghost" 
          size="icon" 
          className="md:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">{t('header.toggleMenu')}</span>
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t('dashboard.title')}</h1>
            {onToggleAnalytics && (
              <Button
                variant={showAnalytics ? 'default' : 'outline'}
                size="sm"
                onClick={onToggleAnalytics}
                className="gap-2"
                aria-pressed={showAnalytics}
              >
                <TrendingUp className="w-4 h-4" />
                <span className="hidden sm:inline">{t('dashboard.analyticsButton')}</span>
              </Button>
            )}
          </div>
          <p className="hidden sm:block text-sm text-muted-foreground">
            {t('dashboard.welcomeRole', { role: getRoleLabel(userRole) })}
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-3 sm:space-x-4">
        <LanguageSwitcher />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              {unreadCount > 0 ? (
                <>
                  <BellRing className="h-5 w-5" />
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                </>
              ) : (
                <Bell className="h-5 w-5" />
              )}
              <span className="sr-only">{t('dashboard.notifications')}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 max-h-[400px] overflow-y-auto">
            <div className="px-2 py-1.5 text-sm font-semibold">
              {t('dashboard.notifications')}
            </div>
            <DropdownMenuSeparator />
            
            {notifications.length === 0 ? (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                {t('dashboard.noNotifications')}
              </div>
            ) : (
              notifications.map((notification) => (
                <div key={notification.id}>
                  <DropdownMenuItem className="flex-col items-start cursor-pointer hover:bg-muted/50">
                    <div className="flex w-full justify-between">
                      <span className="font-medium">
                        {notification.type === 'milestone' ? 'Milestone Update' : 
                         notification.type === 'payment' ? 'Payment Update' : 'Alert'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(notification.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{notification.message}</p>
                    {!notification.read && (
                      <div className="absolute right-2 top-2 h-2 w-2 rounded-full bg-blue-500" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </div>
              ))
            )}
            
            {notifications.length > 0 && (
              <DropdownMenuItem className="text-sm font-medium text-center justify-center cursor-pointer hover:bg-muted/50">
                {t('dashboard.viewAllNotifications')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        
        <div className="hidden md:flex items-center space-x-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
            {userRole.charAt(0).toUpperCase()}
          </div>
          <div className="text-sm">
            <div className="font-medium">{getRoleLabel(userRole)}</div>
            <div className="text-xs text-muted-foreground">
              {userRole}@truestub.com
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
