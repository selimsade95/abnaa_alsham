import { Languages } from "lucide-react";
import { getLanguage, setLanguage, t } from "@/i18n";

export default function LanguageSwitcher({ className = "" }) {
  const language = getLanguage();
  const nextLanguage = language === "ar" ? "en" : "ar";

  const changeLanguage = () => {
    setLanguage(nextLanguage);
    window.location.reload();
  };

  return (
    <button
      type="button"
      onClick={changeLanguage}
      lang={nextLanguage}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted ${className}`}
      aria-label={
        t(language === "ar" ? "controls.switchEnglish" : "controls.switchArabic")
      }
    >
      <Languages className="h-4 w-4" aria-hidden="true" />
      {/* {language === "ar" ? "EN" : "عربي"} */}
    </button>
  );
}
