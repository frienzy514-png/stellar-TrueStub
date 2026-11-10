'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, BellRing, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSavedSearchStore } from '@/core/store/data/saved-searches.store';

export default function SavedSearchesPage() {
  const {
    searches,
    pendingDeleteIds,
    lastError,
    addSearch,
    removeSearch,
    retryPendingDeletes,
    clearError,
  } = useSavedSearchStore();
  const [eventName, setEventName] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [section, setSection] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      if (useSavedSearchStore.getState().pendingDeleteIds.length > 0) {
        void useSavedSearchStore.getState().retryPendingDeletes();
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = eventName.trim();
    if (!name) return;
    const price = Number(maxPrice);
    void addSearch({
      eventName: name,
      maxPrice: maxPrice && price > 0 ? price : undefined,
      section: section.trim() || undefined,
    });
    setEventName('');
    setMaxPrice('');
    setSection('');
  };

  const handleRetryDeletes = async () => {
    setIsRetrying(true);
    try {
      await retryPendingDeletes();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Saved searches</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Get notified when a new listing matches an event, price ceiling and section.
        </p>
      </div>

      {lastError && (
        <div
          role="alert"
          className="border border-destructive/40 bg-destructive/10 text-destructive rounded-xl p-4 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{lastError}</span>
          </div>
          <div className="flex items-center gap-2">
            {pendingDeleteIds.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isRetrying}
                onClick={handleRetryDeletes}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Retry delete
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearError}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="border rounded-xl p-4 bg-card grid gap-3 sm:grid-cols-4">
        <Input
          aria-label="Event name"
          placeholder="Event (e.g. Coldplay)"
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
          required
          className="sm:col-span-2"
        />
        <Input
          aria-label="Max price in USDC"
          type="number"
          min={1}
          placeholder="Max price (USDC)"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
        />
        <Input
          aria-label="Section preference"
          placeholder="Section (optional)"
          value={section}
          onChange={(e) => setSection(e.target.value)}
        />
        <Button type="submit" className="sm:col-span-4 sm:justify-self-start">
          <BellRing className="h-4 w-4 mr-2" />
          Save search &amp; alert me
        </Button>
      </form>

      {searches.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          No saved searches yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {searches.map((s) => (
            <li key={s.id} className="border rounded-xl p-4 bg-card flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold truncate">{s.eventName}</p>
                <p className="text-xs text-muted-foreground">
                  {s.maxPrice ? `Under ${s.maxPrice.toLocaleString()} USDC` : 'Any price'}
                  {' · '}
                  {s.section || 'Any section'}
                </p>
                {s.deleteError && (
                  <p className="text-xs text-destructive mt-1">{s.deleteError}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Delete saved search for ${s.eventName}`}
                onClick={() => {
                  void removeSearch(s.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
