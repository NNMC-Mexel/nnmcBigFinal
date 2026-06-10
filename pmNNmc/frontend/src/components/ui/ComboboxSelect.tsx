import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

interface ComboboxSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  searchable?: boolean;
  className?: string;
}

export default function ComboboxSelect({
  value,
  onChange,
  options,
  placeholder = 'Выберите',
  searchPlaceholder = 'Поиск...',
  emptyText = 'Ничего не найдено',
  disabled = false,
  searchable = false,
  className = '',
}: ComboboxSelectProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedOption = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) =>
      `${option.label} ${option.description || ''}`.toLowerCase().includes(term)
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open && searchable) {
      window.setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open, searchable]);

  const handleOpenChange = () => {
    if (disabled) return;
    setOpen((current) => {
      const next = !current;
      if (!next) setQuery('');
      return next;
    });
  };

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={handleOpenChange}
        className={`flex h-12 w-full min-w-0 items-center justify-between gap-3 rounded-xl border bg-white px-4 text-left text-sm shadow-sm transition-all ${
          open
            ? 'border-cyan-500 ring-2 ring-cyan-100'
            : 'border-slate-300 hover:border-cyan-300'
        } ${disabled ? 'cursor-not-allowed bg-slate-50 text-slate-400' : 'text-slate-800'}`}
      >
        <span className={`min-w-0 truncate ${selectedOption ? 'font-medium' : 'text-slate-500'}`}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-slate-500 transition-transform ${
            open ? 'rotate-180 text-cyan-600' : ''
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          {searchable && (
            <div className="border-b border-slate-100 p-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 outline-none transition-colors focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-100"
                />
              </div>
            </div>
          )}

          <div id={listboxId} role="listbox" className="max-h-72 overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-500">{emptyText}</div>
            ) : (
              filteredOptions.map((option) => {
                const selected = option.value === value;
                return (
                  <button
                    key={option.value || '__empty'}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => handleSelect(option.value)}
                    className={`flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      selected
                        ? 'bg-cyan-50 text-cyan-800'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${
                        selected ? 'border-cyan-600 bg-cyan-600 text-white' : 'border-slate-300'
                      }`}
                    >
                      {selected && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{option.label}</span>
                      {option.description && (
                        <span className="block truncate text-xs text-slate-500">
                          {option.description}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
