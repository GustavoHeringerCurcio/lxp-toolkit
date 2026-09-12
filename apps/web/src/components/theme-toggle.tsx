import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { useT } from "@/lib/i18n";

export function ThemeToggle() {
  const { resolved, setTheme } = useTheme();
  const { t } = useT();
  return (
    <Button
      variant="ghost"
      size="icon"
      title={t("theme.title")}
      aria-label={resolved === "dark" ? t("theme.toLight") : t("theme.toDark")}
      onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
    >
      {resolved === "dark" ? <Moon /> : <Sun />}
    </Button>
  );
}
