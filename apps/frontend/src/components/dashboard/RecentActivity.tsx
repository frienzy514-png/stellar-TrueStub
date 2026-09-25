"use client";

import { Activity, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EscrowData } from './RoleEscrowDashboard';
import { useTranslation } from 'react-i18next';

interface RecentActivityProps {
  escrows: EscrowData[];
  /** Show skeleton rows instead of activity items while a query resolves. */
  isLoading?: boolean;
}

const getActivityIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'cancelled':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'funded':
      return <AlertCircle className="h-4 w-4 text-blue-500" />;
    default:
      return <Clock className="h-4 w-4 text-yellow-500" />;
  }
};

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'completed':
      return 'outline';
    case 'cancelled':
      return 'destructive';
    case 'funded':
      return 'default';
    case 'pending':
      return 'secondary';
    default:
      return 'outline';
  }
};

/** Skeleton placeholder for a single activity row while data loads. */
function ActivityItemSkeleton() {
  return (
    <div className="flex items-start space-x-3">
      {/* icon placeholder */}
      <Skeleton className="mt-0.5 h-4 w-4 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="flex justify-between items-center gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-5 w-20 rounded-full flex-shrink-0" />
        </div>
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-40" />
      </div>
    </div>
  );
}

export function RecentActivity({ escrows, isLoading = false }: RecentActivityProps) {
  const { t } = useTranslation();

  const getActivityMessage = (escrow: EscrowData) => {
    const purchaseId = escrow.metadata?.purchaseId || 'Unknown';
    const eventName = escrow.metadata?.eventName ? `(${escrow.metadata.eventName})` : '';
    
    switch (escrow.status) {
      case 'pending':
        return `#${purchaseId} ${eventName} - ${t('dashboard.statusPending')}`;
      case 'funded':
        return `#${purchaseId} ${eventName} - ${t('dashboard.statusFunded')}`;
      case 'transfer_confirmed':
        return `#${purchaseId} ${eventName} - ${t('dashboard.statusTransferConfirmed')}`;
      case 'transfer_finalized':
        return `#${purchaseId} ${eventName} - ${t('dashboard.statusTransferFinalized')}`;
      case 'completed':
        return `#${purchaseId} ${eventName} - ${t('dashboard.statusCompleted')}`;
      case 'cancelled':
        return `#${purchaseId} ${eventName} - ${t('dashboard.statusCancelled')}`;
      default:
        return `#${purchaseId} ${eventName}`;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return t('dashboard.statusPending');
      case 'funded': return t('dashboard.statusFunded');
      case 'transfer_confirmed': return t('dashboard.statusTransferConfirmed');
      case 'transfer_finalized': return t('dashboard.statusTransferFinalized');
      case 'completed': return t('dashboard.statusCompleted');
      case 'cancelled': return t('dashboard.statusCancelled');
      default: return status;
    }
  };

  // Show skeleton while loading
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium dark:text-white">
            {t('dashboard.recentActivity')}
          </CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <ActivityItemSkeleton key={i} />
          ))}
        </CardContent>
      </Card>
    );
  }

  // Sort escrows by most recent update
  const recentEscrows = [...escrows]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5); // Show only the 5 most recent

  if (recentEscrows.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium dark:text-white">
            {t('dashboard.recentActivity')}
          </CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Activity}
            title={t('dashboard.noActivity')}
            description={t('dashboard.noActivityDescription')}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium dark:text-white">
          {t('dashboard.recentActivity')}
        </CardTitle>
        <Activity className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
      </CardHeader>
      <CardContent className="space-y-4">
        {recentEscrows.map((escrow) => (
          <div key={escrow.id} className="flex items-start space-x-3">
            <div className="mt-0.5">
              {getActivityIcon(escrow.status)}
            </div>
            <div className="flex-1">
              <div className="flex justify-between">
                <p className="text-sm font-medium leading-none dark:text-white">
                  {getActivityMessage(escrow)}
                </p>
                <Badge 
                  variant={getStatusBadgeVariant(escrow.status)}
                  className="text-xs h-5"
                >
                  {getStatusText(escrow.status)}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1">
                {new Date(escrow.updatedAt).toLocaleString()}
              </p>
              
              <div className="mt-1 text-xs text-muted-foreground dark:text-gray-400">
                {escrow.metadata?.eventName && (
                  <span className="block truncate">
                    {escrow.metadata.eventName}
                  </span>
                )}
                {escrow.metadata?.transferDate && escrow.metadata?.eventDate && (
                  <span className="block">
                    {new Date(escrow.metadata.transferDate).toLocaleDateString()} - {new Date(escrow.metadata.eventDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
