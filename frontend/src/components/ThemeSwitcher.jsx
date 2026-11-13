import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";

export default function ThemeSwitcher() {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useTranslation();
  const dark = resolvedTheme === "dark";
  const label = t(dark ? "controls.switchLight" : "controls.switchDark");
  const Icon = dark ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={label}
      title={label}
      className="inline-flex items-center justify-center rounded-lg border bg-card px-3 py-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
