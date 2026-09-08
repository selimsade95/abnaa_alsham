import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "@/lib/api";
import { Printer } from "lucide-react";
import { SEMESTER_LABELS, STATUS_LABELS } from "@/lib/studentDefaults";

export default function PaymentPrint() {
  const { id } = useParams();
  const [student, setStudent] = useState(null);
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get(`/students/${id}`),
      api.get(`/students/${id}/payments`),
    ]).then(([studentResponse, paymentsResponse]) => {
      setStudent(studentResponse.data);
      setPayments(paymentsResponse.data);
    });
  }, [id]);

  useEffect(() => {
    if (student) {
      const timer = setTimeout(() => window.print(), 400);
      return () => clearTimeout(timer);
    }
  }, [student]);

  if (!student)
    return (
      <div className="p-8 text-gray-500" dir="rtl">
        جاري تجهيز سجل المدفوعات...
      </div>
    );

  const profile = student.student || {};
  const fees = student.fees || {};
  return (
    <div className="min-h-screen bg-white p-6" dir="rtl">
      <div className="no-print mx-auto mb-5 flex max-w-3xl justify-end">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white"
        >
          <Printer className="h-4 w-4" /> طباعة
        </button>
      </div>
      <main className="mx-auto max-w-3xl">
        <header className="flex items-center gap-4 border-b-2 border-[#04CDF9] pb-4">
          <img
            src="/assets/logo.png"
            alt="مدرسة اقرأ"
            className="h-16 w-16 object-contain"
          />
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold text-gray-900">
              مدرسة اقرأ
            </h1>
            <p className="text-sm text-gray-600">إيصال سجل المدفوعات</p>
          </div>
          <div className="text-left text-xs text-gray-500">
            تاريخ الطباعة
            <br />
            {new Date().toLocaleDateString("ar-EG")}
          </div>
        </header>
        <section className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 rounded-lg border border-gray-200 p-4 text-sm">
          <div>
            <span className="text-gray-500">الطالب:</span>{" "}
            <strong>{profile.fullName}</strong>
          </div>
          <div>
            <span className="text-gray-500">الكود:</span>{" "}
            <strong>{student.code}</strong>
          </div>
          <div>
            <span className="text-gray-500">الصف:</span>{" "}
            <strong>
              {student.currentClass?.name || profile.newClass || "—"}
            </strong>
          </div>
          <div>
            <span className="text-gray-500">الحالة:</span>{" "}
            <strong>{STATUS_LABELS[profile.status] || "—"}</strong>
          </div>
        </section>
        <section className="mt-5 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg border border-gray-200 p-3">
            <div className="text-xs text-gray-500">إجمالي المستحق</div>
            <strong>{fees.totalPayable || 0}</strong>
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            <div className="text-xs text-gray-500">إجمالي المدفوع</div>
            <strong>{fees.totalPaid || 0}</strong>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="text-xs text-amber-700">المتبقي</div>
            <strong className="text-amber-800">{fees.remaining || 0}</strong>
          </div>
        </section>
        <table className="mt-5 w-full border-collapse border border-gray-300 text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="border border-gray-300 p-2 text-right">التاريخ</th>
              <th className="border border-gray-300 p-2 text-right">السنة</th>
              <th className="border border-gray-300 p-2 text-right">الفصل</th>
              <th className="border border-gray-300 p-2 text-right">المبلغ</th>
              <th className="border border-gray-300 p-2 text-right">ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td className="border border-gray-300 p-2">
                  {(payment.paymentDate || "").slice(0, 10)}
                </td>
                <td className="border border-gray-300 p-2">
                  {payment.academicYear || "—"}
                </td>
                <td className="border border-gray-300 p-2">
                  {SEMESTER_LABELS[payment.semester] || payment.semester}
                </td>
                <td className="border border-gray-300 p-2 font-semibold">
                  {payment.amount}
                </td>
                <td className="border border-gray-300 p-2">
                  {payment.notes || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-6 text-xs text-gray-500">
          هذا المستند يوضح سجل المدفوعات المسجل لدى مدرسة اقرأ.
        </p>
      </main>
    </div>
  );
}
