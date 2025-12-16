"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import * as React from "react"

import { cn } from "@/lib/utils"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "rounded-base border-2 border-border bg-card-background p-4 font-base shadow-shadow",
        className,
      )}
      classNames={{
        // Layout
        months: "flex flex-col sm:flex-row gap-4",
        month: "space-y-4",
        month_caption: "flex justify-center pt-1 pb-2 relative items-center",
        caption_label: "text-sm font-heading font-semibold",
        nav: "flex items-center gap-1",
        button_previous: "absolute left-1 size-8 bg-transparent p-0 opacity-60 hover:opacity-100 inline-flex items-center justify-center rounded-md hover:bg-muted-foreground/10 transition-opacity",
        button_next: "absolute right-1 size-8 bg-transparent p-0 opacity-60 hover:opacity-100 inline-flex items-center justify-center rounded-md hover:bg-muted-foreground/10 transition-opacity",
        month_grid: "w-full border-collapse",
        weekdays: "flex mb-1",
        weekday: "text-muted-foreground w-10 font-medium text-xs text-center",
        week: "flex w-full",
        day: "h-10 w-10 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
        day_button: "h-10 w-10 p-0 font-normal inline-flex items-center justify-center rounded-md hover:bg-main/10 transition-colors aria-selected:opacity-100",
        // Range selection
        range_end: "bg-main text-main-foreground rounded-r-md",
        range_start: "bg-main text-main-foreground rounded-l-md",
        range_middle: "bg-main/20 text-foreground",
        // States
        selected: "bg-main text-main-foreground hover:bg-main hover:text-main-foreground focus:bg-main focus:text-main-foreground rounded-md",
        today: "bg-secondary-background text-foreground font-semibold rounded-md",
        outside: "text-muted-foreground/40",
        disabled: "text-muted-foreground/40 cursor-not-allowed",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName, ...chevronProps }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight
          return <Icon className={cn("size-4", chevronClassName)} {...chevronProps} />
        },
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
