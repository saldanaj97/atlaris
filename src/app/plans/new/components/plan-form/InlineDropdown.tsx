'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import type { DropdownOption } from './types';

type DropdownVariant = 'purple' | 'pink' | 'cyan' | 'rose';

interface InlineDropdownProps {
  id?: string;
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
  variant?: DropdownVariant;
}

const VARIANT_STYLES: Record<
  DropdownVariant,
  {
    pill: string;
    dropdown: string;
    active: string;
    hover: string;
  }
> = {
  purple: {
    pill: 'border-purple-200/60 bg-purple-50/80 text-purple-700 hover:bg-purple-100/80',
    dropdown: 'border-purple-200/60 bg-white/95',
    active: 'bg-purple-100 text-purple-800',
    hover: 'hover:bg-purple-50',
  },
  pink: {
    pill: 'border-pink-200/60 bg-pink-50/80 text-pink-700 hover:bg-pink-100/80',
    dropdown: 'border-pink-200/60 bg-white/95',
    active: 'bg-pink-100 text-pink-800',
    hover: 'hover:bg-pink-50',
  },
  cyan: {
    pill: 'border-cyan-200/60 bg-cyan-50/80 text-cyan-700 hover:bg-cyan-100/80',
    dropdown: 'border-cyan-200/60 bg-white/95',
    active: 'bg-cyan-100 text-cyan-800',
    hover: 'hover:bg-cyan-50',
  },
  rose: {
    pill: 'border-rose-200/60 bg-rose-50/80 text-rose-700 hover:bg-rose-100/80',
    dropdown: 'border-rose-200/60 bg-white/95',
    active: 'bg-rose-100 text-rose-800',
    hover: 'hover:bg-rose-50',
  },
};

/**
 * Inline dropdown component that appears as a styled pill within text.
 * Used in the unified plan generation form for natural language-style input.
 */
export function InlineDropdown({
  id,
  options,
  value,
  isOpen,
  icon,
  onChange,
  onToggle,
  variant = 'purple',
}: InlineDropdownProps) {
  const baseId = useId();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const styles = VARIANT_STYLES[variant];
  const selectedOption = options.find((opt) => opt.value === value);
  const buttonId = id ? `${id}-button` : `${baseId}-button`;
  const menuId = id ? `${id}-menu` : `${baseId}-menu`;

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        onToggle();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onToggle]);

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onToggle();
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onToggle]);

  return (
    <div ref={dropdownRef} className="relative inline-block">
      <button
        type="button"
        onClick={onToggle}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium shadow-sm backdrop-blur-sm transition ${styles.pill}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={menuId}
        id={buttonId}
      >
        {icon}
        <span>{selectedOption?.label ?? value}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute left-0 z-50 mt-2 min-w-[180px] overflow-hidden rounded-2xl border shadow-xl backdrop-blur-xl ${styles.dropdown}`}
          id={menuId}
          role="menu"
          aria-labelledby={buttonId}
        >
          <div className="p-1.5">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  onToggle();
                }}
                className={`w-full rounded-xl px-3 py-2 text-left transition ${
                  option.value === value
                    ? styles.active
                    : `text-gray-700 ${styles.hover}`
                }`}
                role="menuitem"
              >
                <span className="block text-sm font-medium">
                  {option.label}
                </span>
                {option.description && (
                  <span className="block text-xs text-gray-500">
                    {option.description}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
