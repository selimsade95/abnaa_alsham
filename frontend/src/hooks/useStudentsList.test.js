import React, { StrictMode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import api from "@/lib/api";
import { useStudentsList } from "@/hooks/useStudentsList";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
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
});
