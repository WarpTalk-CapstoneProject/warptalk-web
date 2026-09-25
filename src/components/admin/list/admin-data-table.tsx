"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowsDownUp,
  CaretDown,
  CaretLeft,
  CaretRight,
  MagnifyingGlass,
  Tray,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Fragment, useState, type MouseEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { groupRows, type SortDirection } from "@/lib/admin/list-state";
import { cn } from "@/lib/utils";

import type { AdminListController } from "./use-admin-list-state";

export interface AdminColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** The list's sort field this column orders by. Omit for a column that cannot be sorted. */
  sortField?: string;
  /** Direction of the first click on this header — "desc" for dates and amounts. */
  defaultDirection?: SortDirection;
  /** Width and alignment utilities for both the header and the cells. */
  className?: string;
  align?: "left" | "right";
  /** The row's name: never hidden, carries the row link, and titles the board card. */
  primary?: boolean;
}

export interface AdminGrouping<T> {
  keyOf: (row: T) => string;
  label: (key: string) => string;
  /** The bucket order — a pipeline reads in its own order, never alphabetically. */
  order?: readonly string[];
}

const INTERACTIVE = "a,button,input,select,textarea,label,[role=menuitem],[role=checkbox],[data-row-action]";

/**
 * The table every admin list renders: sortable headers, hideable columns, grouping, a board view,
 * and the four states a list is ever in — loading, failed, empty, and "nothing matches".
 *
 * "Nothing matches" and "empty" are different sentences on purpose. A filtered-out directory that
 * says "No workspaces yet" reads as data loss on the one screen where that would be alarming; it
 * says what narrowed it and offers to clear it instead.
 *
 * Grouping and the board work on the rows this table was given. For a server-paged list that is the
 * current page, ordered by the server — the header count says so rather than implying a total.
 */
export function AdminDataTable<T>({
  list,
  columns,
  rows,
  rowKey,
  rowHref,
  onRowClick,
  isPending,
  isError,
  onRetry,
  empty,
  groupings,
  boardGrouping,
  pagination,
  loadMore,
  caption,
  rowClassName,
  minWidth = 720,
}: {
  list?: AdminListController;
  columns: readonly AdminColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  isPending?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  empty: { title: string; description?: string; icon?: ReactNode };
  groupings?: Record<string, AdminGrouping<T>>;
  /** The grouping the board uses while "No grouping" is selected. */
  boardGrouping?: string;
  pagination?: { page: number; pageCount: number; total?: number; pageSize?: number; onPageChange?: (page: number) => void };
  loadMore?: { hasMore: boolean; onLoadMore: () => void; isLoading?: boolean };
  caption?: string;
  rowClassName?: (row: T) => string | undefined;
  minWidth?: number;
}) {
  const t = useTranslations("adminLists.table");
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const hidden = new Set(list?.state.hidden ?? []);
  const visible = columns.filter((column) => column.primary || !hidden.has(column.id));
  const sort = list?.state.sort;
  const groupKey = list?.state.group && list.state.group !== "none" ? list.state.group : undefined;
  const grouping = groupKey ? groupings?.[groupKey] : undefined;
  const boardKey = groupKey ?? boardGrouping;
  const board = list?.state.view === "board" && boardKey ? groupings?.[boardKey] : undefined;

  const navigate = (row: T, event: MouseEvent) => {
    if ((event.target as HTMLElement).closest(INTERACTIVE)) return;
    if (onRowClick) {
      onRowClick(row);
      return;
    }
    const href = rowHref?.(row);
    if (!href) return;
    if (event.metaKey || event.ctrlKey) window.open(href, "_blank", "noopener");
    else router.push(href);
  };

  const primaryCell = (row: T, column: AdminColumn<T>) => {
    const content = column.cell(row);
    const href = column.primary ? rowHref?.(row) : undefined;
    if (!href) return content;
    return (
      <Link
        href={href}
        className="block min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {content}
      </Link>
    );
  };

  const clickable = Boolean(rowHref || onRowClick);
  const narrowed = list?.narrowed ?? false;

  let body: ReactNode;
  if (isError) {
    body = (
      <StateMessage
        icon={<WarningCircle size={20} weight="duotone" />}
        tone="error"
        title={t("errorTitle")}
        description={t("errorDescription")}
        action={
          onRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              {t("retry")}
            </Button>
          ) : null
        }
      />
    );
  } else if (isPending) {
    body = (
      <div aria-busy="true" aria-label={t("loading")}>
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 border-b border-hairline/60 px-4 py-3 last:border-b-0">
            <div className="size-8 animate-pulse rounded-lg bg-surface-2" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-40 animate-pulse rounded bg-surface-2" />
              <div className="h-2.5 w-24 animate-pulse rounded bg-surface-2" />
            </div>
            <div className="hidden h-3 w-20 animate-pulse rounded bg-surface-2 md:block" />
          </div>
        ))}
      </div>
    );
  } else if (rows.length === 0) {
    body = narrowed ? (
      <StateMessage
        icon={<MagnifyingGlass size={20} weight="duotone" />}
        title={t("emptyFiltered")}
        description={t("emptyFilteredHint")}
        action={
          list ? (
            <Button variant="outline" size="sm" onClick={() => list.clearFilters()}>
              {t("clearFilters")}
            </Button>
          ) : null
        }
      />
    ) : (
      <StateMessage icon={empty.icon ?? <Tray size={20} weight="duotone" />} title={empty.title} description={empty.description} />
    );
  } else if (board) {
    const groups = groupRows(rows, board.keyOf, board.order ?? [], true);
    const primary = visible.find((column) => column.primary) ?? visible[0];
    const secondary = visible.filter((column) => column !== primary);
    body = (
      <div className="flex gap-3 overflow-x-auto p-3" role="list" aria-label={caption}>
        {groups.map((group) => (
          <section
            key={group.key}
            role="listitem"
            aria-label={`${board.label(group.key)} (${group.rows.length})`}
            className="flex w-72 shrink-0 flex-col rounded-lg bg-surface-2/50"
          >
            <header className="flex items-center justify-between px-3 py-2 text-[12px] font-medium text-ink">
              <span className="truncate">{board.label(group.key)}</span>
              <span className="tabular-nums text-ink-subtle">{group.rows.length}</span>
            </header>
            <ul className="flex flex-col gap-2 px-2 pb-2">
              {group.rows.map((row) => (
                <li
                  key={rowKey(row)}
                  onClick={(event) => navigate(row, event)}
                  className={cn(
                    "rounded-md border border-hairline bg-surface-1 p-3 text-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
                    clickable && "cursor-pointer hover:border-border",
                  )}
                >
                  <div className="text-[13px] font-medium text-ink">{primaryCell(row, primary)}</div>
                  {secondary.length ? (
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                      {secondary.map((column) => (
                        <Fragment key={column.id}>
                          <dt className="text-ink-subtle">{column.header}</dt>
                          <dd className="min-w-0 truncate text-right text-ink-muted">{column.cell(row)}</dd>
                        </Fragment>
                      ))}
                    </dl>
                  ) : null}
                </li>
              ))}
              {group.rows.length === 0 ? (
                <li className="rounded-md border border-dashed border-hairline px-3 py-4 text-center text-[11px] text-ink-subtle">
                  {t("emptyColumn")}
                </li>
              ) : null}
            </ul>
          </section>
        ))}
      </div>
    );
  } else {
    const groups = grouping ? groupRows(rows, grouping.keyOf, grouping.order ?? []) : [{ key: "", rows: [...rows] }];
    body = (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left" style={{ minWidth }}>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr className="border-b border-border">
              {visible.map((column) => (
                <HeaderCell key={column.id} column={column} list={list} sort={sort} />
              ))}
            </tr>
          </thead>
          {groups.map((group) => {
            const isCollapsed = grouping ? collapsed.has(group.key) : false;
            return (
              <tbody key={group.key || "all"}>
                {grouping ? (
                  <tr className="border-b border-hairline bg-surface-2/40">
                    <th colSpan={visible.length} scope="rowgroup" className="px-4 py-1.5 text-left">
                      <button
                        type="button"
                        aria-expanded={!isCollapsed}
                        onClick={() =>
                          setCollapsed((current) => {
                            const next = new Set(current);
                            if (next.has(group.key)) next.delete(group.key);
                            else next.add(group.key);
                            return next;
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded text-[12px] font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      >
                        <CaretDown size={11} className={cn("transition-transform", isCollapsed && "-rotate-90")} aria-hidden />
                        {grouping.label(group.key)}
                        <span className="font-normal tabular-nums text-ink-subtle">{group.rows.length}</span>
                      </button>
                    </th>
                  </tr>
                ) : null}
                {isCollapsed
                  ? null
                  : group.rows.map((row) => (
                      <tr
                        key={rowKey(row)}
                        onClick={clickable ? (event) => navigate(row, event) : undefined}
                        className={cn(
                          "border-b border-hairline/60 transition-colors last:border-b-0",
                          clickable && "cursor-pointer hover:bg-surface-2/60",
                          rowClassName?.(row),
                        )}
                      >
                        {visible.map((column) => (
                          <td
                            key={column.id}
                            className={cn(
                              "px-4 py-2.5 align-middle text-[13px] text-ink",
                              column.align === "right" && "text-right tabular-nums",
                              column.className,
                            )}
                          >
                            {column.primary ? primaryCell(row, column) : column.cell(row)}
                          </td>
                        ))}
                      </tr>
                    ))}
              </tbody>
            );
          })}
        </table>
      </div>
    );
  }

  const page = pagination?.page ?? list?.state.page ?? 1;
  const setPage = pagination?.onPageChange ?? list?.setPage;
  const showPager = pagination && pagination.pageCount > 1 && setPage && !isError;

  return (
    <div>
      {body}
      {showPager ? (
        <nav
          aria-label={t("pagination")}
          className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-2.5"
        >
          <p className="text-xs tabular-nums text-ink-muted">
            {pagination.total !== undefined && pagination.pageSize
              ? t("showing", {
                  from: (page - 1) * pagination.pageSize + 1,
                  to: Math.min(page * pagination.pageSize, pagination.total),
                  total: pagination.total,
                })
              : t("pageOf", { page, pageCount: pagination.pageCount })}
          </p>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <CaretLeft size={13} aria-hidden />
              {t("previous")}
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pagination.pageCount} onClick={() => setPage(page + 1)}>
              {t("next")}
              <CaretRight size={13} aria-hidden />
            </Button>
          </div>
        </nav>
      ) : null}
      {loadMore?.hasMore && !isError ? (
        <div className="flex justify-center border-t border-hairline px-4 py-2.5">
          <Button variant="outline" size="sm" onClick={loadMore.onLoadMore} disabled={loadMore.isLoading}>
            {loadMore.isLoading ? t("loading") : t("loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function HeaderCell<T>({
  column,
  list,
  sort,
}: {
  column: AdminColumn<T>;
  list?: AdminListController;
  sort?: { field: string; direction: SortDirection };
}) {
  const t = useTranslations("adminLists.table");
  const sortable = Boolean(column.sortField && list && list.config.sortFields.includes(column.sortField));
  const active = sortable && sort?.field === column.sortField;
  const ariaSort = active ? (sort!.direction === "asc" ? "ascending" : "descending") : undefined;
  const base = cn(
    "px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-subtle",
    column.align === "right" && "text-right",
    column.className,
  );

  if (!sortable) {
    return (
      <th scope="col" className={base}>
        {column.header}
      </th>
    );
  }

  const Icon = active ? (sort!.direction === "asc" ? ArrowUp : ArrowDown) : ArrowsDownUp;
  return (
    <th scope="col" className={base} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => {
          const direction: SortDirection = active
            ? sort!.direction === "asc"
              ? "desc"
              : "asc"
            : column.defaultDirection ?? "asc";
          list!.setSort(column.sortField!, direction);
        }}
        aria-label={t("sortBy", { column: column.header })}
        className={cn(
          "group inline-flex items-center gap-1 rounded uppercase tracking-[0.1em] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          column.align === "right" && "flex-row-reverse",
          active && "text-ink",
        )}
      >
        {column.header}
        <Icon size={11} aria-hidden className={cn(!active && "opacity-0 group-hover:opacity-60 group-focus-visible:opacity-60")} />
      </button>
    </th>
  );
}

function StateMessage({
  icon,
  title,
  description,
  action,
  tone,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "error";
}) {
  return (
    <div className="grid place-items-center px-4 py-14 text-center" role={tone === "error" ? "alert" : "status"}>
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "grid size-10 place-items-center rounded-xl",
            tone === "error" ? "bg-destructive/10 text-destructive" : "bg-surface-2 text-ink-subtle",
          )}
        >
          {icon}
        </span>
        <p className="mt-3 text-sm font-medium text-ink">{title}</p>
        {description ? <p className="mt-1 max-w-sm text-xs text-ink-muted">{description}</p> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}
