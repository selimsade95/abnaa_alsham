import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";

export function useStudent(
  id,
  { fullInformation = false, payments = false } = {},
) {
  const [student, setStudent] = useState(null);
  const [studentPayments, setStudentPayments] = useState([]);
  const [loading, setLoading] = useState(Boolean(id));
  const endpoint = fullInformation ? "full-information" : "";

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const studentRequest = api.get(
        `/students/${id}${endpoint ? `/${endpoint}` : ""}`,
      );
      const paymentRequest = payments
        ? api.get(`/students/${id}/payments`)
        : Promise.resolve({ data: [] });
      const [studentResponse, paymentResponse] = await Promise.all([
        studentRequest,
        paymentRequest,
      ]);
      setStudent(studentResponse.data);
      setStudentPayments(paymentResponse.data || []);
    } finally {
      setLoading(false);
    }
  }, [endpoint, id, payments]);

  useEffect(() => {
    load().catch(() => {
      setStudent(null);
      setStudentPayments([]);
    });
  }, [load]);

  return {
    student,
    payments: studentPayments,
    loading,
    reload: load,
  };
}
