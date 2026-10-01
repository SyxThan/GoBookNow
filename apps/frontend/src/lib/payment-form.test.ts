import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InvalidPaymentFormError,
  submitExternalPaymentForm,
} from "./payment-form";

describe("submitExternalPaymentForm", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("submits every backend field unchanged with POST to the payment URL", () => {
    const submit = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => undefined);
    const fields = {
      merchant: "merchant-01",
      order_amount: "250000",
      order_invoice_number: "GBKABC",
      signature: "signed-value",
    };

    const form = submitExternalPaymentForm({
      paymentUrl: "https://pay-sandbox.sepay.vn/v1/checkout/init",
      method: "POST",
      formFields: fields,
    });

    expect(form.getAttribute("action")).toBe(
      "https://pay-sandbox.sepay.vn/v1/checkout/init",
    );
    expect(form.getAttribute("method")).toBe("POST");
    expect(submit).toHaveBeenCalledTimes(1);
    expect(
      Object.fromEntries(
        [...form.querySelectorAll("input")].map((input) => [
          input.name,
          input.value,
        ]),
      ),
    ).toEqual(fields);
  });

  it("rejects malformed or insecure backend redirect contracts", () => {
    expect(() =>
      submitExternalPaymentForm({
        paymentUrl: "javascript:alert(1)",
        method: "POST",
        formFields: { signature: "signed" },
      }),
    ).toThrow(InvalidPaymentFormError);

    expect(() =>
      submitExternalPaymentForm({
        paymentUrl: "https://pay.sepay.vn/v1/checkout/init",
        method: "POST",
        formFields: { signature: "" },
      }),
    ).toThrow(InvalidPaymentFormError);
  });
});
