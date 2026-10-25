"use client";
import ApplicationError from "./error";

export default function GlobalError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="vi">
      <body>
        <ApplicationError {...props} />
      </body>
    </html>
  );
}
