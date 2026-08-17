export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;

export interface PagedResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export function normalizePaging(pageRaw: unknown, pageSizeRaw: unknown) {
  let page = Number(pageRaw);
  if (!Number.isFinite(page) || page < 1) page = 1;

  let pageSize = Number(pageSizeRaw);
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = DEFAULT_PAGE_SIZE;
  if (pageSize > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE;

  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

export function toPagedResult<T>(data: T[], page: number, pageSize: number, totalCount: number): PagedResult<T> {
  return {
    data,
    page,
    pageSize,
    totalCount,
    totalPages: pageSize > 0 ? Math.ceil(totalCount / pageSize) : 0,
  };
}
