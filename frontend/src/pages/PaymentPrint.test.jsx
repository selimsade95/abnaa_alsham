import React, { act } from "react";
import { createRoot } from "react-dom/client";
import api from "@/lib/api";
import PaymentPrint from "@/pages/PaymentPrint";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockSearchParams = new URLSearchParams("search=Demo&page=2&limit=10");

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
jest.mock("react-router-dom", () => ({
  useParams: () => ({}),
  useSearchParams: () => [mockSearchParams],
}), { virtual: true });

describe("payment list print totals", () => {
  let container;
  let root;

  beforeEach(() => {
    api.get.mockImplementation((path) => {
      if (path === "/payments") {
        return Promise.resolve({
          data: {
            data: [
              {
                id: "payment-1",
                student: "student-1",
                feeType: "academic",
                amount: 5,
                totalPayable: 999,
                currentTotalPaid: 999,
                currentTotalRemaining: 0,
              },
              {
                id: "payment-2",
                student: "student-2",
                feeType: "academic",
                amount: 5,
                totalPayable: 999,
                currentTotalPaid: 999,
                currentTotalRemaining: 0,
              },
            ],
            pagination: { page: 2, limit: 10, total: 12, totalPages: 2 },
          },
        });
      }
      if (path === "/payments/summary") {
        return Promise.resolve({
          data: {
            feeTypes: {
              academic: { payable: 300, paid: 80, remaining: 220 },
              transportation: { payable: 0, paid: 0, remaining: 0 },
              books: { payable: 0, paid: 0, remaining: 0 },
              outfit: { payable: 0, paid: 0, remaining: 0 },
            },
          },
        });
      }
      throw new Error(`Unexpected API request: ${path}`);
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

  it("prints the same financial summary used by the payments page", async () => {
    await act(async () => {
      root.render(<PaymentPrint />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(api.get).toHaveBeenCalledWith(
      "/payments",
      expect.objectContaining({
        params: expect.objectContaining({
          search: "Demo",
          page: "2",
          limit: "10",
        }),
      }),
    );
    expect(api.get).toHaveBeenCalledWith(
      "/payments/summary",
      expect.objectContaining({
        params: { search: "Demo" },
      }),
    );
    const financialTotals = container.querySelector("main section");
    expect(financialTotals.textContent).toContain("300");
    expect(financialTotals.textContent).toContain("80");
    expect(financialTotals.textContent).toContain("220");
    expect(financialTotals.textContent).not.toContain("999");
  });
});
