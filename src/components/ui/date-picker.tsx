"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";
import * as React from "react";

function dateFromISO(value: string | undefined | null): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map((v) => Number(v));
  if (!y || !m || !d) return undefined;
  const date = new Date(y, m - 1, d);
  // Validate that the date didn't roll over
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return undefined;
  }
  return date;
}

function isoFromDate(date: Date | undefined): string | undefined {
  if (!date) return undefined;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type DatePickerProps = {
  id?: string;
  placeholder?: string;
  value?: string;
  onChange?: (value: string | undefined) => void;
  required?: boolean;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
};

export function DatePicker({ id, placeholder = "Pick a date", value, onChange, required, disabled, minDate, maxDate, className }: DatePickerProps) {
  const date = dateFromISO(value);
  const [open, setOpen] = React.useState(false);
  const isInvalid = Boolean(required) && !value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-required={required}
          aria-invalid={isInvalid || undefined}
          className={cn("h-10 w-full justify-start text-left font-normal", !date && "text-muted-foreground", className)}
          disabled={disabled}
          data-slot="date-picker-trigger"
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? isoFromDate(date) : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" data-slot="date-picker-content">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d: Date | undefined) => {
            const iso = isoFromDate(d);
            onChange?.(iso);
            setOpen(false);
          }}
          disabled={disabled}
          fromDate={minDate}
          toDate={maxDate}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
