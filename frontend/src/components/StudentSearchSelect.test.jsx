import React, { act } from "react";
import { createRoot } from "react-dom/client";
import api from "@/lib/api";
import StudentSearchSelect from "@/components/StudentSearchSelect";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

describe("StudentSearchSelect", () => {
  let container;
  let root;

  beforeEach(() => {
    api.get.mockResolvedValue({
      data: {
        data: [
          {
            id: "dropped-student",
            code: "STU-001",
            student: { fullName: "Dropped student" },
          },
        ],
      },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  it("requests and shows dropped students when enabled", async () => {
    await act(async () => {
      root.render(<StudentSearchSelect includeDropped onSelect={jest.fn()} />);
    });

    await act(async () => {
      container.querySelector('[role="combobox"]').focus();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(api.get).toHaveBeenCalledWith(
      "/students/options",
      expect.objectContaining({
        params: { includeDropped: true },
      }),
    );
    expect(container.textContent).toContain("Dropped student");
  });

  it("does not include dropped students by default", async () => {
    await act(async () => {
      root.render(<StudentSearchSelect onSelect={jest.fn()} />);
    });

    await act(async () => {
      container.querySelector('[role="combobox"]').focus();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(api.get).toHaveBeenCalledWith(
      "/students/options",
      expect.objectContaining({ params: {} }),
    );
  });
});
