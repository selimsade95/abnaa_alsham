import { getLanguage, setLanguage, t } from "@/i18n";
import arabic from "@/i18n/ar.json";
import english from "@/i18n/en.json";

function catalogKeys(catalog, prefix = "") {
  return Object.entries(catalog).flatMap(([key, value]) =>
    value && typeof value === "object"
      ? catalogKeys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe("frontend localization", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = "";
    document.documentElement.dir = "";
  });

  test("defaults to Arabic and returns Arabic catalog phrases", () => {
    expect(getLanguage()).toBe("ar");
    expect(t("الصفوف")).toBe("الصفوف");
  });

  test("persists English and sets the document language and direction", () => {
    expect(setLanguage("en")).toBe("en");

    expect(localStorage.getItem("abnaa-language")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
    expect(t("الصفوف")).toBe("Classes");
    expect(t("لا توجد نتائج.")).toBe("No results.");
  });

  test("interpolates the selected item count in both languages", () => {
    setLanguage("ar");
    expect(t("general.selectedCount", { count: 2 })).toBe("2 محدد");

    setLanguage("en");
    expect(t("general.selectedCount", { count: 2 })).toBe("2 selected");
  });

  test("does not translate unknown or user-provided text", () => {
    setLanguage("en");
    expect(t("اسم طالب غير معروف")).toBe("اسم طالب غير معروف");
  });

  test("keeps the Arabic and English catalog structures in sync", () => {
    expect(catalogKeys(english).sort()).toEqual(catalogKeys(arabic).sort());
  });

  test("translates parent access, confirmations, and multiline copy", () => {
    setLanguage("en");
    expect(t("بوابة ولي الأمر")).toBe("Parent portal");
    expect(t("استبدال الوثيقة")).toBe("Replace document");
    expect(t("جاري\n          التحميل...")).toBe("Loading...");
    expect(t("تحديد {{0}}", { 0: "Ali" })).toBe("Select Ali");
    expect(t("controls.close")).toBe("Close");
  });
});
