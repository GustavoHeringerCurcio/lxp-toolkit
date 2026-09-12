import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT, type Lang } from "@/lib/i18n";

function FlagBR({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 14" className={className} aria-hidden focusable="false">
      <rect width="20" height="14" fill="#16A34A" />
      <path d="M10 1.55 18.2 7 10 12.45 1.8 7Z" fill="#FACC15" />
      <circle cx="10" cy="7" r="2.6" fill="#1D4ED8" />
      <path d="M7.6 6.2c1.6-.5 3.2-.5 4.8 0" stroke="#F8FAFC" strokeWidth="0.55" fill="none" />
    </svg>
  );
}

function FlagUS({ className }: { className?: string }) {
  const stripe = 14 / 13;
  const reds = [0, 2, 4, 6, 8, 10, 12];
  return (
    <svg viewBox="0 0 20 14" className={className} aria-hidden focusable="false">
      <rect width="20" height="14" fill="#FFFFFF" />
      {reds.map((i) => (
        <rect key={i} y={i * stripe} width="20" height={stripe + 0.1} fill="#DC2626" />
      ))}
      <rect width="9" height={7 * stripe} fill="#1D4ED8" />
    </svg>
  );
}

const OPTIONS: { value: Lang; nameKey: string; Flag: typeof FlagBR }[] = [
  { value: "pt", nameKey: "lang.ptName", Flag: FlagBR },
  { value: "en", nameKey: "lang.enName", Flag: FlagUS },
];

function FlagChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="block size-4 shrink-0 overflow-hidden rounded-[3px] ring-1 ring-foreground/15">
      {children}
    </span>
  );
}

/** Header language switcher: Languages icon + current code, flag items in the menu. */
export function LanguageToggle() {
  const { lang, setLang, t } = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 px-2 text-muted-foreground"
            title={t("lang.title")}
            aria-label={t("lang.aria")}
          />
        }
      >
        <Languages className="size-4" />
        <span className="hidden font-mono text-[11px] font-semibold tracking-widest sm:inline">
          {lang.toUpperCase()}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>{t("lang.title")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={lang} onValueChange={(v) => setLang(v as Lang)}>
          {OPTIONS.map(({ value, nameKey, Flag }) => (
            <DropdownMenuRadioItem key={value} value={value} className="gap-2.5">
              <FlagChip>
                <Flag className="block size-full object-cover" />
              </FlagChip>
              {t(nameKey)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
