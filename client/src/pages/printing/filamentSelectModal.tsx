import { useTable } from "@refinedev/antd";
import { Button, Checkbox, Col, Input, message, Pagination, Row, Space, Table } from "antd";
import { t } from "i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { FilteredQueryColumn, SortedColumn, SpoolIconColumn } from "../../components/column";
import { useSpoolmanFilamentNames, useSpoolmanMaterials, useSpoolmanVendors } from "../../components/otherModels";
import { removeUndefined } from "../../utils/filtering";
import { TableState } from "../../utils/saveload";
import { IFilament } from "../filaments/model";

interface Props {
  description?: string;
  onPrint?: (selectedFilamentIds: number[]) => void;
  onExport?: (selectedFilamentIds: number[]) => void;
  initialSelectedIds?: number[];
  searchPlaceholder?: string;
}

interface IFilamentCollapsed extends IFilament {
  "vendor.name": string | null;
}

// Flatten vendor name into each row so shared table helpers can sort and filter it like a top-level field.
function collapseFilament(element: IFilament): IFilamentCollapsed {
  return { ...element, "vendor.name": element.vendor?.name ?? null };
}

const MIN_TABLE_SCROLL_Y = 180;
const TABLE_BOTTOM_GAP = 16;

// Combine server-side paging with lightweight local selection so the print flow can stay inside one dialog.
const FilamentSelectModal = ({ description, onPrint, onExport, initialSelectedIds, searchPlaceholder }: Props) => {
  const [selectedItems, setSelectedItems] = useState<number[]>(initialSelectedIds ?? []);
  const [messageApi, contextHolder] = message.useMessage();
  const navigate = useNavigate();
  const [tableScrollY, setTableScrollY] = useState<number>(300);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);

  const { tableProps, sorters, filters, setFilters, currentPage, pageSize, setCurrentPage, setPageSize } =
    useTable<IFilamentCollapsed>({
      resource: "filament",
      meta: {
        queryParams: {
          ...(debouncedSearch.length > 0 ? { search: debouncedSearch } : {}),
        },
      },
      syncWithLocation: false,
      pagination: {
        mode: "server",
        currentPage: 1,
        pageSize: 50,
      },
      sorters: {
        mode: "server",
      },
      filters: {
        mode: "server",
      },
      queryOptions: {
        select(data) {
          return {
            total: data.total,
            data: data.data.map(collapseFilament),
          };
        },
      },
    });

  const tableState: TableState = {
    sorters,
    filters,
    pagination: { currentPage, pageSize },
  };

  const dataSource = [...(tableProps.dataSource ?? [])];
  const selectedSet = useMemo(() => new Set(selectedItems), [selectedItems]);
  const paginationTotal = tableProps.pagination ? (tableProps.pagination.total ?? 0) : 0;

  useEffect(() => {
    const computeScrollHeight = () => {
      if (!tableContainerRef.current) {
        return;
      }
      // Recompute against the current viewport so the table can fill the dialog without introducing a second pager row.
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const tableTop = tableContainerRef.current.getBoundingClientRect().top;
      const availableHeight = Math.floor(viewportHeight - tableTop - TABLE_BOTTOM_GAP);
      setTableScrollY(Math.max(MIN_TABLE_SCROLL_Y, availableHeight));
    };

    computeScrollHeight();

    const onViewportResize = () => computeScrollHeight();
    window.addEventListener("resize", onViewportResize);
    window.addEventListener("orientationchange", onViewportResize);
    window.visualViewport?.addEventListener("resize", onViewportResize);
    window.visualViewport?.addEventListener("scroll", onViewportResize);

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => computeScrollHeight()) : undefined;
    if (resizeObserver && rootRef.current) {
      resizeObserver.observe(rootRef.current);
    }

    return () => {
      window.removeEventListener("resize", onViewportResize);
      window.removeEventListener("orientationchange", onViewportResize);
      window.visualViewport?.removeEventListener("resize", onViewportResize);
      window.visualViewport?.removeEventListener("scroll", onViewportResize);
      resizeObserver?.disconnect();
    };
  }, []);
  const handlePageChange = useCallback(
    (page: number, nextPageSize?: number) => {
      if (typeof nextPageSize === "number" && nextPageSize !== pageSize) {
        setPageSize(nextPageSize);
      }
      setCurrentPage(page);
    },
    [pageSize],
  );
  const handlePageSizeChange = useCallback((_current: number, size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  // Debounce search input to avoid excessive API calls while typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, setCurrentPage]);

  // Bulk toggles only touch the rows currently visible after paging and server-side filtering.
  const selectUnselectFiltered = useCallback(
    (select: boolean) => {
      setSelectedItems((prevSelected) => {
        const nextSelected = new Set(prevSelected);
        dataSource.forEach((filament) => {
          if (select) {
            nextSelected.add(filament.id);
          } else {
            nextSelected.delete(filament.id);
          }
        });
        return Array.from(nextSelected);
      });
    },
    [dataSource],
  );

  const handleSelectItem = useCallback((item: number) => {
    setSelectedItems((prevSelected) =>
      prevSelected.includes(item) ? prevSelected.filter((selected) => selected !== item) : [...prevSelected, item],
    );
  }, []);

  const isAllFilteredSelected = dataSource.length > 0 && dataSource.every((filament) => selectedSet.has(filament.id));
  const isSomeButNotAllFilteredSelected =
    dataSource.some((filament) => selectedSet.has(filament.id)) && !isAllFilteredSelected;

  const commonProps = {
    t,
    navigate,
    actions: () => [],
    dataSource,
    tableState,
    sorter: true,
  };

  const resolvedDescription =
    description ??
    t("printing.filamentSelect.description", {
      defaultValue: "Search for and select filament labels to print:",
    });
  const resolvedSearchPlaceholder =
    searchPlaceholder ??
    t("printing.filamentSelect.searchPlaceholder", {
      defaultValue: "Search by filament ID, vendor, name, or material",
    });

  return (
    <>
      {contextHolder}
      <div ref={rootRef} style={{ width: "100%", display: "flex", flexDirection: "column", height: "100%" }}>
        {(resolvedDescription || tableProps.pagination) && (
          <Row gutter={[12, 8]} align="middle" style={{ marginBottom: 8 }}>
            <Col flex="auto">{resolvedDescription && <div style={{ margin: 0 }}>{resolvedDescription}</div>}</Col>
            {tableProps.pagination && (
              <Col flex="none">
                <Pagination
                  size="small"
                  current={currentPage}
                  pageSize={pageSize}
                  total={paginationTotal}
                  showSizeChanger
                  pageSizeOptions={["10", "20", "50", "100"]}
                  showQuickJumper
                  onChange={handlePageChange}
                  onShowSizeChange={handlePageSizeChange}
                />
              </Col>
            )}
          </Row>
        )}
        <Row gutter={[12, 8]} style={{ marginBottom: 8 }}>
          <Col xs={24} md={12}>
            <Input.Search
              placeholder={resolvedSearchPlaceholder}
              value={searchTerm}
              allowClear
              enterButton
              onChange={(event) => {
                setSearchTerm(event.target.value);
              }}
              onSearch={(value) => {
                setSearchTerm(value);
              }}
            />
          </Col>
        </Row>
        <Row gutter={[12, 12]} align="middle" style={{ marginBottom: 8 }}>
          <Col flex="none">
            <Button
              onClick={() => {
                setSearchTerm("");
                setFilters([], "replace");
                setCurrentPage(1);
              }}
            >
              {t("buttons.clearFilters")}
            </Button>
          </Col>
          <Col flex="auto">
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <Checkbox
                checked={isAllFilteredSelected}
                indeterminate={isSomeButNotAllFilteredSelected}
                onChange={(e) => {
                  selectUnselectFiltered(e.target.checked);
                }}
              >
                {t("printing.filamentSelect.selectAll")}
              </Checkbox>
              <div style={{ minWidth: 140, textAlign: "right" }}>
                {t("printing.filamentSelect.selectedTotal", {
                  count: selectedItems.length,
                })}
              </div>
              <Space>
                {onPrint && (
                  <Button
                    type="primary"
                    onClick={() => {
                      if (selectedItems.length === 0) {
                        messageApi.open({
                          type: "error",
                          content: t("printing.filamentSelect.noFilamentsSelected"),
                        });
                        return;
                      }
                      onPrint(selectedItems);
                    }}
                  >
                    {t("printing.qrcode.button")}
                  </Button>
                )}
                {onExport && (
                  <Button
                    type="primary"
                    onClick={() => {
                      if (selectedItems.length === 0) {
                        messageApi.open({
                          type: "error",
                          content: t("printing.filamentSelect.noFilamentsSelected"),
                        });
                        return;
                      }
                      onExport(selectedItems);
                    }}
                  >
                    {t("printing.qrcode.exportButton")}
                  </Button>
                )}
              </Space>
            </div>
          </Col>
        </Row>
        <div ref={tableContainerRef} style={{ flex: 1, minHeight: 0 }}>
          <Table
            {...tableProps}
            rowKey="id"
            tableLayout="fixed"
            pagination={false}
            dataSource={dataSource}
            scroll={{ y: tableScrollY, x: "max-content" }}
            columns={removeUndefined([
              {
                width: 48,
                render: (_, item: IFilament) => (
                  <Checkbox checked={selectedSet.has(item.id)} onChange={() => handleSelectItem(item.id)} />
                ),
              },
              SortedColumn({
                ...commonProps,
                id: "id",
                i18ncat: "filament",
                width: 70,
              }),
              FilteredQueryColumn({
                ...commonProps,
                id: "vendor.name",
                i18nkey: "filament.fields.vendor_name",
                filterValueQuery: useSpoolmanVendors(),
                width: 180,
              }),
              SpoolIconColumn({
                ...commonProps,
                id: "name",
                i18ncat: "filament",
                width: 320,
                color: (record: IFilamentCollapsed) =>
                  record.multi_color_hexes
                    ? {
                        colors: record.multi_color_hexes.split(","),
                        vertical: record.multi_color_direction === "longitudinal",
                      }
                    : record.color_hex,
                filterValueQuery: useSpoolmanFilamentNames(),
              }),
              FilteredQueryColumn({
                ...commonProps,
                id: "material",
                i18ncat: "filament",
                filterValueQuery: useSpoolmanMaterials(),
                width: 140,
              }),
            ])}
          />
        </div>
      </div>
    </>
  );
};

export default FilamentSelectModal;
