import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { Printer } from "lucide-react";
import { SEMESTER_LABELS, STATUS_LABELS } from "@/lib/studentDefaults";

export default function PaymentPrint({ studentHistory = false }) {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [student, setStudent] = useState(null);
  const [payments, setPayments] = useState([]);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    if (id && !studentHistory) {
      api
        .get(`/payments/${id}`)
        .then((paymentResponse) => {
          setSelectedPayment(paymentResponse.data);
          return api.get(`/students/${paymentResponse.data.student}`);
        })
        .then((studentResponse) => {
          setStudent(studentResponse.data);
          setPayments([]);
          setReady(true);
        });
    } else if (studentHistory) {
      api
        .get(`/students/${id}`)
        .then((studentResponse) => {
          setStudent(studentResponse.data);
          return api.get(`/students/${id}/payments`);
        })
        .then((paymentsResponse) => {
          setPayments(paymentsResponse.data);
          setReady(true);
        });
    } else {
      const params = Object.fromEntries(searchParams.entries());

      api.get("/payments", { params }).then((response) => {
        const nextPayments = response.data;
        setPayments(nextPayments);
        setSelectedPayment(null);
        const studentIds = [
          ...new Set(nextPayments.map((payment) => payment.student)),
        ];
        if (studentIds.length === 1) {
          return api
            .get(`/students/${studentIds[0]}`)
            .then((studentResponse) => {
              setStudent(studentResponse.data);
              setReady(true);
            });
        }
        setStudent(null);
        setReady(true);
      });
    }
  }, [id, searchParams, studentHistory]);

  useEffect(() => {
    if (ready && (student || payments.length > 0)) {
      const timer = setTimeout(() => window.print(), 400);
      return () => clearTimeout(timer);
    }
  }, [ready, student, payments]);

  if (!ready || (!student && payments.length === 0))
    return (
      <div className="p-8 text-gray-500" dir="rtl">
        جاري تجهيز سجل المدفوعات...
      </div>
    );

  const profile = student?.student || {};
  const fees = student?.fees || {};
  const records = selectedPayment ? [selectedPayment] : payments;
  const distinctStudents = new Set(records.map((payment) => payment.student))
    .size;
  const multipleStudents = !selectedPayment && distinctStudents > 1;
  const totalPayable = multipleStudents
    ? [
        ...new Map(
          records.map((payment) => [
            payment.student,
            payment.totalPayable || 0,
          ]),
        ).values(),
      ].reduce((sum, value) => sum + value, 0)
    : fees.totalPayable || 0;
  const totalRemaining = multipleStudents
    ? [
        ...new Map(
          records.map((payment) => [
            payment.student,
            payment.currentTotalRemaining ?? payment.totalRemaining ?? 0,
          ]),
        ).values(),
      ].reduce((sum, value) => sum + value, 0)
    : fees.remaining || 0;
  const totalPaid = multipleStudents
    ? [
        ...new Map(
          records.map((payment) => [
            payment.student,
            payment.currentTotalPaid ?? payment.totalPaid ?? 0,
          ]),
        ).values(),
      ].reduce((sum, value) => sum + value, 0)
    : fees.totalPaid || 0;

  return (
    <div className="min-h-screen bg-white p-6" dir="rtl">
      {/* Print button */}
      <div className="no-print mx-auto mb-5 flex max-w-3xl justify-end">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white"
        >
          <Printer className="h-4 w-4" />
          طباعة
        </button>
      </div>

      {/* Printable document */}
      <main className="mx-auto flex min-h-[calc(100vh-100px)] max-w-3xl flex-col">
        {/* Header */}
        <header className="flex items-center gap-4 border-b-2 border-[#04CDF9] pb-4">
          {/* Left Logo */}
          <img
            src="/assets/school_logo.png"
            alt="مدرسة أبناء الشام"
            className="h-16 w-16 object-contain"
          />

          {/* Center */}
          <div className="flex-1 text-center">
            <h1 className="text-2xl font-extrabold text-gray-900">
              مدرسة أبناء الشام
            </h1>
            <p className="text-sm text-gray-600">إيصال سجل المدفوعات</p>
          </div>

          {/* Right Logo */}
          <img
            src="/assets/logo.png"
            alt="مدرسة أبناء الشام"
            className="h-16 w-16 object-contain"
          />
        </header>

        {/* Student Information */}
        {!multipleStudents && (
          <section className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 rounded-lg border border-gray-200 p-4 text-sm">
            <div>
              <span className="text-gray-500">الطالب:</span>{" "}
              <strong>
                {profile.fullName || records[0]?.studentName || "—"}
              </strong>
            </div>

            <div>
              <span className="text-gray-500">الكود:</span>{" "}
              <strong>{student?.code || records[0]?.studentCode || "—"}</strong>
            </div>

            <div>
              <span className="text-gray-500">الصف:</span>{" "}
              <strong>
                {student?.currentClass?.name || profile.newClass || "—"}
              </strong>
            </div>

            <div>
              <span className="text-gray-500">الحالة:</span>{" "}
              <strong>{STATUS_LABELS[profile.status] || "—"}</strong>
            </div>
          </section>
        )}

        {/* Overall Fees */}
        {!selectedPayment && (student || multipleStudents) && (
          <section className="mt-5 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-xs text-gray-500">إجمالي المستحق</div>
              <strong>{totalPayable}</strong>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-xs text-gray-500">إجمالي المدفوع</div>
              <strong>{totalPaid}</strong>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs text-amber-700">المتبقي</div>
              <strong className="text-amber-800">{totalRemaining}</strong>
            </div>
          </section>
        )}

        {/* Selected Payment Summary */}
        {selectedPayment && (
          <section className="mt-5 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-xs text-gray-500">إجمالي المستحق</div>
              <strong>{selectedPayment.totalPayable || 0}</strong>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-xs text-gray-500">
                المدفوع حتى هذه الدفعة
              </div>
              <strong>
                {selectedPayment.totalPaidAtPayment ??
                  selectedPayment.totalPaid ??
                  0}
              </strong>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs text-amber-700">المتبقي بعد الدفعة</div>
              <strong className="text-amber-800">
                {selectedPayment.totalRemainingAtPayment ??
                  selectedPayment.totalRemaining ??
                  0}
              </strong>
            </div>
          </section>
        )}

        {/* Payments Table */}
        <table className="mt-5 w-full border-collapse border border-gray-300 text-sm">
          <thead className="bg-gray-100">
            <tr>
              {multipleStudents && (
                <th className="border border-gray-300 p-2 text-right">
                  الطالب
                </th>
              )}
              <th className="border border-gray-300 p-2 text-right">التاريخ</th>
              <th className="border border-gray-300 p-2 text-right">السنة</th>
              <th className="border border-gray-300 p-2 text-right">الفصل</th>
              <th className="border border-gray-300 p-2 text-right">المبلغ</th>
              <th className="border border-gray-300 p-2 text-right">
                المدفوع حتى الدفعة
              </th>
              <th className="border border-gray-300 p-2 text-right">
                المتبقي بعدها
              </th>
              <th className="border border-gray-300 p-2 text-right">ملاحظات</th>
            </tr>
          </thead>

          <tbody>
            {records.map((payment) => (
              <tr key={payment.id}>
                {multipleStudents && (
                  <td className="border border-gray-300 p-2">
                    {payment.studentName || "—"}
                  </td>
                )}
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
                  {payment.totalPaidAtPayment ?? payment.totalPaid ?? "—"}
                </td>

                <td className="border border-gray-300 p-2">
                  {payment.totalRemainingAtPayment ??
                    payment.totalRemaining ??
                    "—"}
                </td>

                <td className="border border-gray-300 p-2">
                  {payment.notes || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Document note */}
        <p className="mt-6 text-xs text-gray-500">
          هذا المستند يوضح سجل المدفوعات المسجل لدى مدرسة أبناء الشام.
        </p>

        {/* Push footer to bottom */}
        <div className="flex-1" />

        {/* Print Footer */}
        <footer className="mt-6 border-t border-gray-200 pt-3 text-center text-xs text-gray-500">
          تاريخ الطباعة: {new Date().toLocaleDateString("ar-EG")}
        </footer>
      </main>
    </div>
  );
}
