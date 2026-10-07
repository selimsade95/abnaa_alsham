import { appendStudentSibling } from "@/lib/studentDefaults";

describe("appendStudentSibling", () => {
  it("keeps every consecutively selected sibling", () => {
    const first = {
      id: "student-1",
      student: { fullName: "Sibling One", gender: "male" },
    };
    const second = {
      id: "student-2",
      student: { fullName: "Sibling Two", gender: "female" },
    };
    const third = {
      id: "student-3",
      student: { fullName: "Sibling Three", gender: "male" },
    };

    const siblings = [first, second, third].reduce(
      (selected, student) => appendStudentSibling(selected, student),
      [],
    );

    expect(siblings.map((sibling) => sibling.studentId)).toEqual([
      "student-1",
      "student-2",
      "student-3",
    ]);
    expect(siblings.map((sibling) => sibling.order)).toEqual([1, 2, 3]);
    expect(appendStudentSibling(siblings, second)).toBe(siblings);
  });
});
