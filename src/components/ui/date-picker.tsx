"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from 'date-fns';
import { CalendarIcon } from "lucide-react";
import * as React from "react";

export type DatePickerProps = {
  id?: string;
  placeholder?: string;
  value?: string;
  onChange?: (date: Date | undefined) => void;
  required?: boolean;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
};

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


export function DatePicker({ id, placeholder = "Pick a date", value, onChange, required, disabled, minDate, maxDate, className }: DatePickerProps) {
  const [date, setDate] = React.useState<Date | undefined>(value ? dateFromISO(value) : undefined);
  const [open, setOpen] = React.useState(false);
  const isInvalid = Boolean(required) && !value;

  // Sync internal state with value prop changes
  React.useEffect(() => {
    const newDate = value ? dateFromISO(value) : undefined;
    setDate(newDate);
  }, [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full h-12 justify-start text-left font-base",
            className
          )}
        >
          <CalendarIcon className="h-4 w-4" />
          {date ? format(date, "PPP") : <span className="text-muted-foreground">{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        sideOffset={8}
        alignOffset={0}
        collisionPadding={16}
      >
        <Calendar
          mode="single"
          selected={date}
          onSelect={(selectedDate) => {
            setDate(selectedDate);
            if (selectedDate) {
              onChange?.(selectedDate);
            } else {
              onChange?.(undefined);
            }
            setOpen(false);
          }}
          disabled={disabled}
          fromDate={minDate}
          toDate={maxDate}
        />
      </PopoverContent>
    </Popover>
  );
}
