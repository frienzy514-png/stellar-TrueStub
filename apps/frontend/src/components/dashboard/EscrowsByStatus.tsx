"use client";

import { DollarSign, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EscrowData } from './RoleEscrowDashboard';
import { useTranslation } from 'react-i18next';

interface EscrowsByStatusProps {
  escrows: EscrowData[];
  userRole: 'guest' | 'event' | 'admin';
}

export function EscrowsByStatus({ escrows, userRole }: EscrowsByStatusProps) {
  const { t } = useTranslation();

  const stats = {
    total: escrows.length,
    pending: escrows.filter(e => e.status === 'pending').length,
    funded: escrows.filter(e => e.status === 'funded').length,
    completed: escrows.filter(e => e.status === 'completed').length,
    cancelled: escrows.filter(e => e.status === 'cancelled').length,
  };

  const getTotalAmount = () => {
    return escrows.reduce((sum, escrow) => {
      if (escrow.status === 'cancelled') return sum;
      return sum + escrow.amount;
    }, 0);
  };

  const getStatusStats = () => {
    if (userRole === 'guest') {
      return [
        { 
          title: t('dashboard.active'),
          value: stats.pending + stats.funded,
          icon: Clock,
          color: 'text-blue-500',
          description: t('dashboard.active'),
        },
        { 
          title: t('dashboard.completed'),
          value: stats.completed,
          icon: CheckCircle,
          color: 'text-green-500',
          description: t('dashboard.completed'),
        },
      ];
    }

    if (userRole === 'event') {
      return [
        { 
          title: t('dashboard.statusPending'),
          value: stats.pending,
          icon: Clock,
          color: 'text-yellow-500',
          description: t('dashboard.statusPending'),
        },
        { 
          title: t('dashboard.active'),
          value: stats.funded,
          icon: AlertCircle,
          color: 'text-blue-500',
          description: t('dashboard.active'),
        },
      ];
    }

    // Admin view
    return [
      { 
        title: t('dashboard.active'),
        value: stats.pending + stats.funded,
        icon: AlertCircle,
        color: 'text-blue-500',
        description: t('dashboard.active'),
      },
      { 
        title: t('dashboard.completed'),
        value: stats.completed,
        icon: CheckCircle,
        color: 'text-green-500',
        description: t('dashboard.completed'),
      },
      { 
        title: t('dashboard.cancelled'),
        value: stats.cancelled,
        icon: XCircle,
        color: 'text-red-500',
        description: t('dashboard.cancelled'),
      },
    ];
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium dark:text-white">
            {t('dashboard.totalValue')}
          </CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold dark:text-white">
            ${getTotalAmount().toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">
            {stats.total} {t('dashboard.totalEscrows')}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {getStatusStats().map((stat, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium dark:text-white">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold dark:text-white">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
