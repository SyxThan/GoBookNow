import type { SePayInitiationResponse } from "./api-client";

export type ExternalPaymentForm = Pick<
  SePayInitiationResponse,
  "paymentUrl" | "method" | "formFields"
>;

export class InvalidPaymentFormError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPaymentFormError";
  }
}

export function submitExternalPaymentForm(
  payment: ExternalPaymentForm,
  documentRef: Document = document,
): HTMLFormElement {
  const action = validatePaymentUrl(payment.paymentUrl);
  if (payment.method !== "POST") {
    throw new InvalidPaymentFormError("Payment form method must be POST.");
  }

  const fields = Object.entries(payment.formFields ?? {});
  if (
    fields.length === 0 ||
    fields.some(
      ([name, value]) =>
        name.trim().length === 0 ||
        typeof value !== "string" ||
        value.length === 0,
    )
  ) {
    throw new InvalidPaymentFormError("Payment form fields are incomplete.");
  }

  const form = documentRef.createElement("form");
  form.hidden = true;
  form.setAttribute("method", payment.method);
  form.setAttribute("action", action);

  for (const [name, value] of fields) {
    const input = documentRef.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  documentRef.body.appendChild(form);
  HTMLFormElement.prototype.submit.call(form);
  return form;
}

function validatePaymentUrl(value: string): string {
  if (!value) {
    throw new InvalidPaymentFormError("Payment URL is missing.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidPaymentFormError("Payment URL is invalid.");
  }

  if (url.protocol !== "https:" || url.username || url.password) {
    throw new InvalidPaymentFormError("Payment URL is not secure.");
  }
  return value;
}
