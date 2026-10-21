import React, { StrictMode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import api from "@/lib/api";
import { useStudentsList } from "@/hooks/useStudentsList";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("@/lib/auth", () => ({
  useAuth: () => ({ has: () => true }),
}));
jest.mock("@/hooks/useClasses", () => ({
  useClasses: () => ({ classes: [] }),
}));
jest.mock("react-router-dom", () => ({
  useNavigate: () => jest.fn(),
}), { virtual: true });

function ListHarness() {
  window.studentListState = useStudentsList();
  return null;
}

describe("student list pagination persistence", () => {
  let container;
  let root;

  beforeEach(() => {
    window.sessionStorage.clear();
    window.sessionStorage.setItem("students-list-page", JSON.stringify(4));
    api.post.mockReset();
    api.get.mockImplementation((path, config) => {
      if (path === "/registration-paths")
        return Promise.resolve({ data: { paths: [] } });
      return Promise.resolve({
        data: {
          data: [],
          summary: {},
          pagination: {
            page: config.params.page,
            limit: config.params.limit,
            total: 100,
            totalPages: 5,
          },
        },
      });
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete window.studentListState;
    jest.clearAllMocks();
  });

  it("restores the saved page in StrictMode and after navigating away", async () => {
    await act(async () => {
      root.render(
        <StrictMode>
          <ListHarness />
        </StrictMode>,
      );
    });

    expect(api.get).toHaveBeenCalledWith(
      "/students",
      expect.objectContaining({
        params: expect.objectContaining({ page: 4 }),
      }),
    );
    expect(window.studentListState.studentTemplate).toEqual([
      "fullName",
      "gender",
      "birthdate",
      "registrationPath",
      "finalRegistrationPath",
      "newClass",
      "currentAddress",
      "orphan",
      "orphanOf",
      "orphanDocType",
      "fatherName",
      "fatherDeceased",
      "motherName",
      "motherPhone",
      "academicYear",
      "academicFee",
      "academicPaid",
      "generalDiscountPercentage",
      "siblingsStaffDiscountPercentage",
      "booksFee",
      "booksPaid",
      "busFee",
      "busPaid",
      "busNo",
      "dropped",
    ]);

    await act(async () => {
      await window.studentListState.load(3);
    });
    expect(window.sessionStorage.getItem("students-list-page")).toBe("3");

    await act(async () => root.unmount());
    root = createRoot(container);
    api.get.mockClear();

    await act(async () => {
      root.render(
        <StrictMode>
          <ListHarness />
        </StrictMode>,
      );
    });

    expect(api.get).toHaveBeenCalledWith(
      "/students",
      expect.objectContaining({
        params: expect.objectContaining({ page: 3 }),
      }),
    );
  });

  it("sorts the full student result set and starts sorting from the first page", async () => {
    await act(async () => {
      root.render(<ListHarness />);
    });

    await act(async () => {
      window.studentListState.sortStudents("name");
    });

    expect(api.get).toHaveBeenLastCalledWith(
      "/students",
      expect.objectContaining({
        params: expect.objectContaining({
          page: 1,
          sortBy: "name",
          sortOrder: "asc",
        }),
      }),
    );

    await act(async () => {
      window.studentListState.sortStudents("name");
    });

    expect(api.get).toHaveBeenLastCalledWith(
      "/students",
      expect.objectContaining({
        params: expect.objectContaining({
          page: 1,
          sortBy: "name",
          sortOrder: "desc",
        }),
      }),
    );
  });

  it("tracks upload progress and switches to processing while the import runs", async () => {
    let resolveImport;
    let uploadConfig;
    api.post.mockImplementation((endpoint, _form, config) => {
      uploadConfig = config;
      return new Promise((resolve) => {
        resolveImport = resolve;
      });
    });

    await act(async () => {
      root.render(<ListHarness />);
    });

    let importPromise;
    await act(async () => {
      importPromise = window.studentListState.importStudents({
        target: {
          files: [new File(["student"], "students.csv")],
          value: "students.csv",
        },
      });
    });

    expect(api.post).toHaveBeenCalledWith(
      "/students/import",
      expect.any(FormData),
      expect.objectContaining({ onUploadProgress: expect.any(Function) }),
    );

    await act(async () => {
      uploadConfig.onUploadProgress({ loaded: 50, total: 100 });
    });
    expect(window.studentListState.importProgress).toEqual({
      stage: "uploading",
      percent: 50,
    });

    await act(async () => {
      uploadConfig.onUploadProgress({ loaded: 100, total: 100 });
    });
    expect(window.studentListState.importProgress).toEqual({
      stage: "processing",
      percent: null,
    });

    await act(async () => {
      resolveImport({ data: { created: 1 } });
      await importPromise;
    });
    expect(window.studentListState.importProgress).toBeNull();
  });
});
