import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "cn"

function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="group/select relative">
      <select
        data-slot="select"
        className={cn(
          // Closed control: solid card surface so the value is always readable,
          // brand-tinted hover/focus to match the Folio skin.
          "h-8 w-full min-w-0 cursor-pointer appearance-none rounded-lg border border-input bg-card py-1 pr-8 pl-2.5 text-base font-medium text-foreground shadow-none transition-[color,background-color,border-color,box-shadow] outline-none",
          "hover:border-brand/45 hover:bg-accent/40",
          "focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-ring/35",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground disabled:opacity-60",
          "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
          // Native popup list: force popover tokens so options never render as
          // white-on-white (the dark-mode bug). `color-scheme` in index.css
          // makes the OS-rendered list follow the theme too.
          "[&_option]:bg-popover [&_option]:text-popover-foreground [&_option]:font-normal",
          "[&_option:checked]:bg-accent [&_option:checked]:text-accent-foreground",
          "[&_optgroup]:bg-popover [&_optgroup]:text-muted-foreground",
          "md:text-sm dark:bg-input/40 dark:hover:bg-accent/50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground transition-colors group-hover/select:text-brand group-focus-within/select:text-brand"
        aria-hidden
      />
    </div>
  )
}

export { Select }
