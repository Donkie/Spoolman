import { Table } from "antd";
import type { TableProps } from "antd";
import type { AnyObject } from "antd/es/_util/type";
import type { ColumnType, ColumnsType } from "antd/es/table";
import { useMemo } from "react";
import type { HTMLAttributes, MouseEvent as ReactMouseEvent, ThHTMLAttributes } from "react";
import { useSavedState } from "../utils/saveload";
import "../utils/overrides.css";

interface ResizableHeaderCellProps extends ThHTMLAttributes<HTMLTableCellElement> {
  onResizeStart?: (event: ReactMouseEvent<HTMLSpanElement>) => void;
  onResizeAutoFit?: (event: ReactMouseEvent<HTMLSpanElement>) => void;
  resizable?: boolean;
}

// Keep resize-handle gestures separate from the header cell itself so resizing
// does not accidentally trigger the table's built-in sort interactions.
function ResizableHeaderCell({
  className,
  onResizeStart,
  onResizeAutoFit,
  resizable,
  children,
  ...restProps
}: ResizableHeaderCellProps) {
  return (
    <th {...restProps} className={`${className ?? ""}${resizable ? " resizable-table-header-cell" : ""}`}>
      {children}
      {resizable && (
        <span
          className="resizable-table-header-handle"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onResizeStart?.(event);
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onResizeAutoFit?.(event);
          }}
        />
      )}
    </th>
  );
}

function serializeDataIndex(dataIndex: unknown): string | undefined {
  if (Array.isArray(dataIndex)) {
    return dataIndex.map((part) => String(part)).join(".");
  }
  if (typeof dataIndex === "string" || typeof dataIndex === "number") {
    return String(dataIndex);
  }
  return undefined;
}

function columnIdentifier<RecordType extends AnyObject>(
  column: ColumnType<RecordType>,
  index: number,
  parentId: string,
): string {
  const key = column.key != null ? String(column.key) : undefined;
  const dataIndex = serializeDataIndex(column.dataIndex);
  // Widths are persisted, so the identifier must stay stable across renders even when
  // the table reorders or re-renders its column objects.
  return key ?? dataIndex ?? `${parentId}-${index}`;
}

function measureIntrinsicElementWidth(element: HTMLElement): number {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".resizable-table-header-handle").forEach((handle) => handle.remove());
  // Measure a detached clone so auto-fit can use the content's natural width instead
  // of the already-constrained width inside the current table cell.
  clone.style.position = "fixed";
  clone.style.left = "-99999px";
  clone.style.top = "-99999px";
  clone.style.width = "max-content";
  clone.style.maxWidth = "none";
  clone.style.minWidth = "0";
  clone.style.display = "inline-block";
  clone.style.whiteSpace = "nowrap";
  clone.style.visibility = "hidden";
  document.body.appendChild(clone);
  const measuredWidth = clone.getBoundingClientRect().width;
  clone.remove();
  return measuredWidth;
}

function measureCellAutoFitWidth(cell: HTMLTableCellElement): number {
  const style = window.getComputedStyle(cell);
  const paddingLeft = Number.parseFloat(style.paddingLeft || "0") || 0;
  const paddingRight = Number.parseFloat(style.paddingRight || "0") || 0;
  const horizontalPadding = paddingLeft + paddingRight;

  const childElements = Array.from(cell.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
  if (childElements.length > 0) {
    const widestChild = childElements.reduce((maxWidth, child) => {
      return Math.max(maxWidth, measureIntrinsicElementWidth(child));
    }, 0);
    return Math.ceil(widestChild + horizontalPadding);
  }

  const text = cell.textContent?.trim() ?? "";
  if (text.length === 0) {
    return Math.ceil(horizontalPadding);
  }

  const textProbe = document.createElement("span");
  textProbe.textContent = text;
  textProbe.style.position = "fixed";
  textProbe.style.left = "-99999px";
  textProbe.style.top = "-99999px";
  textProbe.style.whiteSpace = "nowrap";
  textProbe.style.font = style.font;
  textProbe.style.fontSize = style.fontSize;
  textProbe.style.fontWeight = style.fontWeight;
  textProbe.style.letterSpacing = style.letterSpacing;
  textProbe.style.visibility = "hidden";
  document.body.appendChild(textProbe);
  const textWidth = textProbe.getBoundingClientRect().width;
  textProbe.remove();

  return Math.ceil(textWidth + horizontalPadding);
}

function hasCellOverflow(cell: HTMLTableCellElement): boolean {
  if (cell.scrollWidth > cell.clientWidth + 1) {
    return true;
  }

  return Array.from(cell.children).some((child) => {
    if (!(child instanceof HTMLElement)) {
      return false;
    }
    return child.scrollWidth > child.clientWidth + 1;
  });
}

export interface ResizableTableProps<RecordType extends AnyObject> extends TableProps<RecordType> {
  // Saved widths are keyed per table, so each page keeps its own resize state.
  columnResizeKey: string;
  minColumnWidth?: number;
}

// Wrap AntD's Table with stable per-column identifiers and persisted widths so
// resize/autofit behavior stays reusable across list and settings screens.
function ResizableTable<RecordType extends AnyObject>(props: ResizableTableProps<RecordType>) {
  const { columns, components, columnResizeKey, minColumnWidth = 72, scroll, sticky, ...tableProps } = props;
  const [columnWidths, setColumnWidths] = useSavedState<Record<string, number>>(
    `table-column-widths-${columnResizeKey}`,
    {},
  );

  const { resolvedColumns, requiredMinWidth } = useMemo(() => {
    if (!columns) {
      return { resolvedColumns: columns, requiredMinWidth: minColumnWidth };
    }

    let minWidthSum = 0;

    const withResize = (input: ColumnsType<RecordType>, parentId: string): ColumnsType<RecordType> => {
      return input.map((column, index) => {
        const id = columnIdentifier(column, index, parentId);
        const columnWidth =
          typeof columnWidths[id] === "number"
            ? columnWidths[id]
            : typeof column.width === "number"
              ? column.width
              : undefined;

        const columnChildren = (column as { children?: ColumnsType<RecordType> }).children;
        const hasChildren = Array.isArray(columnChildren) && columnChildren.length > 0;
        const nextColumn: ColumnsType<RecordType>[number] = {
          ...column,
        };

        if (hasChildren) {
          (nextColumn as { children?: ColumnsType<RecordType> }).children = withResize(columnChildren, id);
          return nextColumn;
        }

        const leafColumn = nextColumn as ColumnType<RecordType>;
        const existingMinWidth =
          typeof (leafColumn as { minWidth?: number }).minWidth === "number"
            ? (leafColumn as { minWidth?: number }).minWidth
            : undefined;
        const effectiveMinWidth = Math.max(minColumnWidth, existingMinWidth ?? 0);

        if (typeof columnWidth === "number") {
          leafColumn.width = Math.max(effectiveMinWidth, columnWidth);
        }
        (leafColumn as { minWidth?: number }).minWidth = effectiveMinWidth;

        minWidthSum += typeof leafColumn.width === "number" ? leafColumn.width : effectiveMinWidth;

        const originalOnHeaderCell = (column as ColumnType<RecordType>).onHeaderCell;
        leafColumn.onHeaderCell = (col) => {
          const existingProps = (originalOnHeaderCell?.(col as never) ?? {}) as Record<string, unknown>;
          return {
            ...existingProps,
            resizable: true,
            onResizeStart: (event: ReactMouseEvent<HTMLSpanElement>) => {
              const startX = event.clientX;
              const currentHeaderCell = event.currentTarget.closest("th");
              const baseWidth = Math.max(
                minColumnWidth,
                currentHeaderCell?.getBoundingClientRect().width ?? columnWidth ?? minColumnWidth,
              );
              const originalCursor = document.body.style.cursor;
              const originalUserSelect = document.body.style.userSelect;
              document.body.style.cursor = "col-resize";
              document.body.style.userSelect = "none";

              const onMouseMove = (moveEvent: MouseEvent) => {
                const nextWidth = Math.max(minColumnWidth, baseWidth + moveEvent.clientX - startX);
                setColumnWidths((previous) => {
                  if (previous[id] === nextWidth) {
                    return previous;
                  }
                  return {
                    ...previous,
                    [id]: nextWidth,
                  };
                });
              };

              const onMouseUp = () => {
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
                document.body.style.cursor = originalCursor;
                document.body.style.userSelect = originalUserSelect;
              };

              document.addEventListener("mousemove", onMouseMove);
              document.addEventListener("mouseup", onMouseUp);
            },
            onResizeAutoFit: (event: ReactMouseEvent<HTMLSpanElement>) => {
              const currentHeaderCell = event.currentTarget.closest("th");
              const headerRow = currentHeaderCell?.parentElement;
              if (!(currentHeaderCell instanceof HTMLTableCellElement) || !(headerRow instanceof HTMLTableRowElement)) {
                return;
              }

              const headerCells = Array.from(headerRow.cells);
              const columnIndex = headerCells.indexOf(currentHeaderCell);
              if (columnIndex === -1) {
                return;
              }

              const tableContainer = currentHeaderCell.closest(".ant-table-container");
              const currentWidth = Math.ceil(currentHeaderCell.getBoundingClientRect().width);
              let nextWidth = measureCellAutoFitWidth(currentHeaderCell);
              let hasOverflow = hasCellOverflow(currentHeaderCell);

              if (tableContainer) {
                // Auto-fit should account for the widest visible body cell so a header
                // label alone does not produce a column that still truncates row data.
                const bodyRows = Array.from(tableContainer.querySelectorAll("tbody tr"));
                bodyRows.forEach((row) => {
                  if (!(row instanceof HTMLTableRowElement)) {
                    return;
                  }
                  const cell = row.cells.item(columnIndex);
                  if (cell) {
                    nextWidth = Math.max(nextWidth, measureCellAutoFitWidth(cell));
                    hasOverflow = hasOverflow || hasCellOverflow(cell);
                  }
                });
              }

              const autoFitWidth = Math.max(minColumnWidth, nextWidth);
              const finalWidth = hasOverflow
                ? autoFitWidth
                : Math.max(minColumnWidth, Math.min(currentWidth, autoFitWidth));
              setColumnWidths((previous) => {
                if (previous[id] === finalWidth) {
                  return previous;
                }
                return {
                  ...previous,
                  [id]: finalWidth,
                };
              });
            },
          } as unknown as HTMLAttributes<HTMLElement>;
        };

        return nextColumn;
      });
    };

    return {
      resolvedColumns: withResize(columns as ColumnsType<RecordType>, "root"),
      requiredMinWidth: minWidthSum,
    };
  }, [columns, columnWidths, minColumnWidth, setColumnWidths]);

  const mergedComponents = useMemo(() => {
    return {
      ...components,
      header: {
        ...components?.header,
        cell: ResizableHeaderCell,
      },
    };
  }, [components]);

  const resolvedScroll = useMemo(() => {
    const nextScroll = { ...(scroll ?? {}) };
    // Keep horizontal scrolling enabled once the sum of leaf-column minimums exceeds the
    // available width, otherwise resized columns would collapse unpredictably.
    if (nextScroll.x === undefined) {
      nextScroll.x = requiredMinWidth;
    } else if (typeof nextScroll.x === "number") {
      nextScroll.x = Math.max(nextScroll.x, requiredMinWidth);
    }
    return nextScroll;
  }, [requiredMinWidth, scroll]);

  return (
    <Table<RecordType>
      {...tableProps}
      columns={resolvedColumns}
      components={mergedComponents}
      scroll={resolvedScroll}
      sticky={sticky ?? true}
    />
  );
}

export default ResizableTable;
