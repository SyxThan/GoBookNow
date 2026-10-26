import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ServiceForm } from "./service-form";
import type { ManagedService } from "@gobook/api-client/catalog-management";
const data: ManagedService = {
  id: "service",
  title: "Trải nghiệm đã lưu",
  slug: "saved",
  kind: "EVENT",
  category: { id: "category", name: "Sự kiện" },
  summary: null,
  description: null,
  thumbnailUrl: null,
  priceAmount: "180000",
  currency: "VND",
  durationMinutes: null,
  status: "DRAFT",
};
describe("Service edit category contract", () => {
  it("prefills the nested API category even when category options arrive later, preserving input", () => {
    const props = {
      data,
      creating: false,
      busy: false,
      categoriesError: false,
      onRefetchCategories: vi.fn(),
      onSubmit: vi.fn(),
    };
    const { rerender } = render(
      <ServiceForm {...props} categories={undefined} categoriesLoading />,
    );
    const title = screen.getByLabelText(/Tên dịch vụ/);
    fireEvent.change(title, { target: { value: "Nội dung đang sửa" } });
    rerender(
      <ServiceForm
        {...props}
        categories={[
          {
            id: "category",
            code: "EVENT",
            name: "Sự kiện",
            slug: "events",
            scope: "EVENT",
            description: null,
            icon: null,
          },
        ]}
        categoriesLoading={false}
      />,
    );
    expect(screen.getByLabelText(/Danh mục/)).toHaveValue("category");
    expect(title).toHaveValue("Nội dung đang sửa");
    fireEvent.change(screen.getByLabelText(/Loại trải nghiệm/), {
      target: { value: "SERVICE" },
    });
    expect(screen.getByLabelText(/Danh mục/)).toHaveValue("");
  });
});
