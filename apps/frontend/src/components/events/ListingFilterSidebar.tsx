'use client';

import { EVENT_CATEGORIES, SECTION_FILTERS } from '@/lib/mockData/events';
import { formatListingPrice } from './formatListingPrice';
import { Search } from 'lucide-react';

interface ListingFilterSidebarProps {
  searchQuery: string;
  selectedCategories: string[];
  selectedSections: string[];
  dateFrom: string;
  dateTo: string;
  minPrice: number;
  maxPrice: number;
  onSearchChange: (value: string) => void;
  onCategoryToggle: (category: string) => void;
  onSectionToggle: (section: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onMinPriceChange: (value: number) => void;
  onMaxPriceChange: (value: number) => void;
}

const PRICE_BARS = [
  { id: 'bar-1', height: 10 },
  { id: 'bar-2', height: 18 },
  { id: 'bar-3', height: 24 },
  { id: 'bar-4', height: 20 },
  { id: 'bar-5', height: 28 },
  { id: 'bar-6', height: 16 },
  { id: 'bar-7', height: 22 },
  { id: 'bar-8', height: 14 },
  { id: 'bar-9', height: 10 },
  { id: 'bar-10', height: 26 },
];

const PRICE_MIN = 0;
const PRICE_MAX = 1000;

function CheckboxRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500 dark:border-slate-600"
      />
      {label}
    </label>
  );
}

export default function ListingFilterSidebar({
  searchQuery,
  selectedCategories,
  selectedSections,
  dateFrom,
  dateTo,
  minPrice,
  maxPrice,
  onSearchChange,
  onCategoryToggle,
  onSectionToggle,
  onDateFromChange,
  onDateToChange,
  onMinPriceChange,
  onMaxPriceChange,
}: ListingFilterSidebarProps) {
  const leftPercent = ((minPrice - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100;
  const rightPercent = ((maxPrice - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100;

  return (
    <aside className="w-full border-b border-gray-200 px-6 py-8 lg:w-[215px] lg:border-b-0 lg:border-r dark:border-slate-700 dark:bg-slate-900/0">

      {/* Event search */}
      <section className="pb-8">
        <h2 className="mb-4 text-[15px] font-semibold text-gray-900 dark:text-white">
          Search
        </h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Event name…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-slate-600
                       bg-white dark:bg-slate-800 pl-9 pr-3 py-2 text-sm
                       text-gray-900 dark:text-gray-100 placeholder:text-gray-400
                       focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </section>

      <div className="my-0 h-px bg-gray-200 dark:bg-slate-700" />

      {/* Category */}
      <section className="py-8">
        <h2 className="mb-5 text-[15px] font-semibold text-gray-900 dark:text-white">
          Category
        </h2>
        <div className="space-y-3">
          {EVENT_CATEGORIES.map((category) => (
            <CheckboxRow
              key={category}
              checked={selectedCategories.includes(category)}
              label={category}
              onChange={() => onCategoryToggle(category)}
            />
          ))}
        </div>
      </section>

      <div className="my-0 h-px bg-gray-200 dark:bg-slate-700" />

      {/* Date range */}
      <section className="py-8">
        <h2 className="mb-4 text-[15px] font-semibold text-gray-900 dark:text-white">
          Event Date
        </h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
              From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600
                         bg-white dark:bg-slate-800 px-3 py-2 text-sm
                         text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
              To
            </label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              onChange={(e) => onDateToChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600
                         bg-white dark:bg-slate-800 px-3 py-2 text-sm
                         text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>
      </section>

      <div className="my-0 h-px bg-gray-200 dark:bg-slate-700" />

      {/* Price range */}
      <section className="py-8">
        <h2 className="mb-3 text-[15px] font-semibold text-gray-900 dark:text-white">
          Price Range
        </h2>
        <p className="mb-5 text-sm text-gray-700 dark:text-gray-300">
          {formatListingPrice(minPrice)} – {formatListingPrice(maxPrice)}
        </p>

        <div className="relative px-2 pb-3">
          <div className="mb-4 flex h-10 items-end justify-between gap-1">
            {PRICE_BARS.map((bar) => (
              <span
                key={bar.id}
                className="w-full rounded-t-sm bg-orange-200 dark:bg-orange-900/30"
                style={{ height: `${bar.height}px` }}
              />
            ))}
          </div>
          <div className="relative h-1 rounded-full bg-orange-100 dark:bg-orange-900/20">
            <div
              className="absolute h-1 rounded-full bg-orange-500"
              style={{
                left: `${leftPercent}%`,
                width: `${Math.max(rightPercent - leftPercent, 4)}%`,
              }}
            />
            <span
              className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white bg-orange-500 shadow"
              style={{ left: `calc(${leftPercent}% - 8px)` }}
            />
            <span
              className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white bg-orange-500 shadow"
              style={{ left: `calc(${rightPercent}% - 8px)` }}
            />
          </div>
          <input
            type="range"
            min={PRICE_MIN}
            max={PRICE_MAX}
            step={1}
            value={minPrice}
            onChange={(e) =>
              onMinPriceChange(Math.min(Number(e.target.value), maxPrice - 1))
            }
            className="absolute inset-x-0 top-0 h-full w-full appearance-none bg-transparent opacity-0 cursor-pointer"
          />
          <input
            type="range"
            min={PRICE_MIN}
            max={PRICE_MAX}
            step={1}
            value={maxPrice}
            onChange={(e) =>
              onMaxPriceChange(Math.max(Number(e.target.value), minPrice + 1))
            }
            className="absolute inset-x-0 top-0 h-full w-full appearance-none bg-transparent opacity-0 cursor-pointer"
          />
        </div>
      </section>

      <div className="my-0 h-px bg-gray-200 dark:bg-slate-700" />

      {/* Section / seat type */}
      <section className="pt-8">
        <h2 className="mb-5 text-[15px] font-semibold text-gray-900 dark:text-white">
          Section Type
        </h2>
        <div className="space-y-3">
          {SECTION_FILTERS.filter((s) => s.value !== 'all').map((section) => (
            <CheckboxRow
              key={section.value}
              checked={selectedSections.includes(section.value)}
              label={section.label}
              onChange={() => onSectionToggle(section.value)}
            />
          ))}
        </div>
      </section>
    </aside>
  );
}
