"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@gobook/api-client";
import { usePortalSession } from "./use-session";
import { EmptyState, SkeletonCards } from "@gobook/ui/primitives";

export type PageResult<T> = {
  items: T[];
  page: number;
  total: number;
  totalPages: number;
  limit: number;
};
export function useWorkspaceRequest() {
  const { ready, token, onToken } = usePortalSession();
  const request = useCallback(
    <T,>(path: string, init: RequestInit = {}) =>
      apiRequest<T>(path, init, token, onToken),
    [token, onToken],
  );
  return { ready, request };
}
export function useWorkspaceQuery<T>(
  path: string,
  key: readonly unknown[],
  enabled = true,
) {
  const { ready, request } = useWorkspaceRequest();
  const query = useQuery<T>({
    queryKey: key,
    enabled: ready && enabled,
    staleTime: 0,
    queryFn: ({ signal }) => request<T>(path, { signal }),
  });
  return { ...query, request };
}
export function friendlyWorkspaceError(error: unknown) {
  if (error instanceof ApiError) {
    const support = error.requestId ? ` Mã hỗ trợ: ${error.requestId}` : "";
    if (error.status === 401)
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập để tiếp tục.";
    if (error.status === 403)
      return (
        "Tài khoản chưa có quyền thực hiện thao tác này. Đối tác cần được phê duyệt." +
        support
      );
    if (error.status === 409 && error.code === "SERVICE_DELETE_REQUIRES_HIDE")
      return "Hãy ẩn dịch vụ đang mở bán trước khi xóa." + support;
    if (error.status === 409)
      return (
        "Trạng thái hiện tại chưa cho phép thao tác này. Hãy kiểm tra lịch trùng, chỗ đã được đặt hoặc các điều kiện áp dụng." +
        support
      );
    return error.message;
  }
  return "Chưa kết nối được với GoBookNow. Vui lòng thử lại.";
}
export function useWorkspaceAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const pending = useRef(false);
  async function act(work: () => Promise<unknown>, success: string) {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(success);
      return true;
    } catch (reason) {
      setError(friendlyWorkspaceError(reason));
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { busy, error, notice, act, setError };
}
export function ActionFeedback({
  error,
  notice,
}: {
  error?: string;
  notice?: string;
}) {
  return (
    <>
      {error && (
        <p
          role="alert"
          className="status-note mb-5 !bg-coral/20 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="status-note mb-5 !bg-mint/40 text-sm">
          {notice}
        </p>
      )}
    </>
  );
}
export function ResourceState({
  query,
  children,
}: {
  query: {
    isPending: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => unknown;
  };
  children: ReactNode;
}) {
  if (query.isPending) return <SkeletonCards />;
  if (query.isError)
    return (
      <EmptyState
        title="Chưa thể mở nội dung này"
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <button
              className="secondary-button"
              onClick={() => query.refetch()}
            >
              Thử lại
            </button>
            {query.error instanceof ApiError && query.error.status === 401 && (
              <Link href="/login" className="primary-button">
                Đăng nhập để tiếp tục
              </Link>
            )}
          </div>
        }
      >
        {friendlyWorkspaceError(query.error)}
      </EmptyState>
    );
  return children;
}
