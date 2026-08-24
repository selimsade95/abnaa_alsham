export const emptyStudent = () => ({
  student: {
    orphan: false,
    orphanOf: "",
    previousClass: "",
    newClass: "",
    status: "resident",
    fullName: "",
    birthdate: "",
    birthPlace: "",
    currentAddress: "",
    gender: "male",
    languages: [],
    hobbies: [],
    addressCodes: { sector: "", block: "", minutes: "", floor: "", apartment: "" },
    chronicDisease: false,
    chronicDiseaseDetails: "",
    permanentHabits: false,
    permanentHabitsDetails: "",
  },
  siblings: [],
  father: { name: "", alive: true, phone: "", address: "", profession: "", whatsapp: "", telegram: "" },
  mother: { name: "", alive: true, phone: "", address: "", profession: "", whatsapp: "", telegram: "" },
  general: {
    whatsappGroupPhone: "",
    emergencyContact: { name: "", relation: "", phone: "" },
  },
  previousEducation: [],
  islamicLegalEducation: "",
  bestAchievement: "",
  otherInfo: { familySmokers: false, transportation: "", notes: "" },
  signing: { parentName: "", relationToStudent: "" },
});

export const LANGUAGES = ["العربية", "التركية", "الإنجليزية", "الكردية", "أخرى"];

export const STATUS_LABELS = {
  immigrant: "مهاجر",
  displaced: "نازح",
  resident: "مقيم",
};

export const GENDER_LABELS = { male: "ذكر", female: "أنثى" };

export const ORPHAN_OF_LABELS = { mother: "الأم", father: "الأب", both: "كلاهما" };
