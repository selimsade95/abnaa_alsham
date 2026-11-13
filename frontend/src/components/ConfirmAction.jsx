import { getLanguage } from "@/i18n";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function ConfirmAction({ action, onClose }) {
  return (
    <AlertDialog open={Boolean(action)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent dir={getLanguage() === "ar" ? "rtl" : "ltr"} className="w-[calc(100%-2rem)] rounded-lg">
        <AlertDialogTitle>{action?.title}</AlertDialogTitle>
        <AlertDialogDescription>{action?.description || "هل تريد المتابعة؟"}</AlertDialogDescription>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction onClick={action?.run}>{action?.label || "تأكيد"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
