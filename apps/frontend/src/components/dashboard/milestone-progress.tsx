import { Check, Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EscrowData } from './RoleEscrowDashboard';

export interface MilestoneProgressProps {
  milestones: EscrowData['milestones'];
  className?: string;
}

export function MilestoneProgress({ milestones = [], className }: MilestoneProgressProps) {
  if (!milestones || milestones.length === 0) {
    return null;
  }

  type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'rejected';

  const getStatusIcon = (status: MilestoneStatus) => {
    switch (status) {
      case 'completed':
        return <Check className="h-3 w-3 text-green-600 dark:text-green-400" aria-hidden="true" />;
      case 'rejected':
        return <X className="h-3 w-3 text-red-600 dark:text-red-400" aria-hidden="true" />;
      case 'in_progress':
        return <div className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400" aria-hidden="true" />;
      default: // pending
        return <Clock className="h-3 w-3 text-gray-500 dark:text-gray-400" aria-hidden="true" />;
    }
  };

  const getStatusColor = (status: MilestoneStatus) => {
    switch (status) {
      case 'completed':
        return 'text-green-700 dark:text-green-400';
      case 'rejected':
        return 'text-red-700 dark:text-red-400';
      case 'in_progress':
        return 'text-blue-700 dark:text-blue-400';
      default: // pending
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <ol className={cn('space-y-3', className)} aria-label="Milestone Progress">
      {milestones.map((milestone, index) => (
        <li key={milestone.id} className="relative list-none">
          <div className="flex items-start">
            <div className="flex items-center justify-center h-5 w-5 rounded-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 mr-2 mt-0.5" aria-hidden="true">
              {getStatusIcon(milestone.status)}
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-center">
                <span className={cn('text-xs font-semibold', getStatusColor(milestone.status))}>
                  {milestone.name.split('_').map(word => 
                    word.charAt(0).toUpperCase() + word.slice(1)
                  ).join(' ')}
                  <span className="sr-only"> - Status: {milestone.status}</span>
                </span>
                {milestone.dueDate && (
                  <span className="text-xs text-muted-foreground">
                    Due: {new Date(milestone.dueDate).toLocaleDateString()}
                  </span>
                )}
              </div>
              {milestone.completedAt && milestone.status === 'completed' && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  Completed on {new Date(milestone.completedAt).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
          {index < milestones.length - 1 && (
            <div className="absolute left-2.5 top-5 h-5 w-px bg-gray-300 dark:bg-gray-700 -ml-px" aria-hidden="true" />
          )}
        </li>
      ))}
    </ol>
  );
}
