import { useTable } from "@refinedev/antd";
import { Button, Checkbox, Col, Input, message, Pagination, Row, Space, Table } from "antd";
import { t } from "i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { FilteredQueryColumn, SortedColumn, SpoolIconColumn } from "../../components/column";
import {
  useSpoolmanFilamentFilter,
  useSpoolmanLocations,
  useSpoolmanLotNumbers,
  useSpoolmanMaterials,
} from "../../components/otherModels";
import { removeUndefined } from "../../utils/filtering";
import { TableState } from "../../utils/saveload";
import { ISpool } from "../spools/model";

interface Props {
  description?: string;
  initialSelectedIds?: number[];
  onExport?: (selectedIds: number[]) => void;
  onPrint?: (selectedIds: number[]) => void;
  searchPlaceholder?: string;
}

interface ISpoolCollapsed extends ISpool {
  "filament.combined_name": string;
  "filament.id": number;
  "filament.material"?: string;
}

function collapseSpool(element: ISpool): ISpoolCollapsed {
  let filament_name: string;
  if (element.filament.vendor && "name" in element.filament.vendor) {
    filament_name = `${element.filament.vendor.name} - ${element.filament.name}`;
  } else {
    filament_name = element.filament.name ?? element.filament.id.toString();
  }
  return {
    ...element,
    "filament.combined_name": filament_name,
    "filament.id": element.filament.id,
    "filament.material": element.filament.material,
  };
}

const SpoolSelectModal = ({ description, initialSelectedIds, onExport, onPrint, searchPlaceholder }: Props) => {
  const MIN_TABLE_SCROLL_Y = 180;
  const TABLE_BOTTOM_GAP = 16;
  const [selectedItems, setSelectedItems] = useState<number[]>(initialSelectedIds ?? []);
  const [showArchived, setShowArchived] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedArchivedMap, setSelectedArchivedMap] = useState<Record<number, boolean>>({});
  const [tableScrollY, setTableScrollY] = useState<number>(300);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);

  const { tableProps, sorters, filters, setFilters, currentPage, pageSize, setCurrentPage, setPageSize } =
    useTable<ISpoolCollapsed>({
      resource: "spool",
      meta: {
        queryParams: {
          ["allow_archived"]: showArchived,
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
            data: data.data.map(collapseSpool),
          };
        },
      },
    });

  const tableState: TableState = {
    sorters,
    filters,
    pagination: { currentPage: currentPage, pageSize },
  };

  const dataSource: ISpoolCollapsed[] = useMemo(
    () => (tableProps.dataSource || []).map((record) => ({ ...record })),
    [tableProps.dataSource],
  );
  const selectedSet = useMemo(() => new Set(selectedItems), [selectedItems]);

  useEffect(() => {
    if (dataSource.length === 0) {
      return;
    }
    setSelectedArchivedMap((prev) => {
      const next = { ...prev };
      dataSource.forEach((spool) => {
        next[spool.id] = spool.archived === true;
      });
      return next;
    });
  }, [dataSource]);

  useEffect(() => {
    const computeScrollHeight = () => {
      if (!tableContainerRef.current) {
        return;
      }
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

  // Debounce search input to avoid excessive API calls while typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, setCurrentPage]);

  const paginationTotal = tableProps.pagination ? (tableProps.pagination.total ?? 0) : 0;
  const handlePageChange = useCallback(
    (page: number, nextPageSize?: number) => {
      if (typeof nextPageSize === "number" && nextPageSize !== pageSize) {
        setPageSize(nextPageSize);
      }
      setCurrentPage(page);
    },
    [pageSize, setPageSize, setCurrentPage],
  );
  const handlePageSizeChange = useCallback(
    (_current: number, size: number) => {
      setPageSize(size);
      setCurrentPage(1);
    },
    [setPageSize, setCurrentPage],
  );

  const selectUnselectFiltered = useCallback(
    (select: boolean) => {
      setSelectedItems((prevSelected) => {
        const nextSelected = new Set(prevSelected);
        dataSource.forEach((spool) => {
          if (select) {
            nextSelected.add(spool.id);
          } else {
            nextSelected.delete(spool.id);
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

  const isAllFilteredSelected = dataSource.length > 0 && dataSource.every((spool) => selectedSet.has(spool.id));
  const isSomeButNotAllFilteredSelected =
    dataSource.some((spool) => selectedSet.has(spool.id)) && !isAllFilteredSelected;

  const commonProps = {
    t,
    navigate,
    actions: () => {
      return [];
    },
    dataSource,
    tableState,
    sorter: true,
  };
  const resolvedDescription =
    description ??
    t("printing.spoolSelect.description", {
      defaultValue: "Search for and select spool labels to print:",
    });
  const resolvedSearchPlaceholder =
    searchPlaceholder ??
    t("printing.spoolSelect.searchPlaceholder", {
      defaultValue: "Search by spool ID, filament, material, location, or lot number",
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
                setDebouncedSearch("");
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
                {t("printing.spoolSelect.selectAll")}
              </Checkbox>
              <Checkbox
                checked={showArchived}
                onChange={(e) => {
                  setShowArchived(e.target.checked);
                  if (!e.target.checked) {
                    setSelectedItems((prevSelected) =>
                      prevSelected.filter((selected) => selectedArchivedMap[selected] !== true),
                    );
                  }
                }}
              >
                {t("printing.spoolSelect.showArchived")}
              </Checkbox>
              <div style={{ minWidth: 140, textAlign: "right" }}>
                {t("printing.spoolSelect.selectedTotal", {
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
                          content: t("printing.spoolSelect.noSpoolsSelected"),
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
                          content: t("printing.spoolSelect.noSpoolsSelected"),
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
                render: (_, item: ISpool) => (
                  <Checkbox checked={selectedSet.has(item.id)} onChange={() => handleSelectItem(item.id)} />
                ),
              },
              SortedColumn({
                ...commonProps,
                id: "id",
                i18ncat: "spool",
                width: 70,
              }),
              SpoolIconColumn({
                ...commonProps,
                id: "filament.combined_name",
                dataId: "filament.combined_name",
                i18nkey: "spool.fields.filament_name",
                width: 360,
                color: (record: ISpoolCollapsed) =>
                  record.filament.multi_color_hexes
                    ? {
                        colors: record.filament.multi_color_hexes.split(","),
                        vertical: record.filament.multi_color_direction === "longitudinal",
                      }
                    : record.filament.color_hex,
                filterValueQuery: useSpoolmanFilamentFilter(),
              }),
              FilteredQueryColumn({
                ...commonProps,
                id: "filament.material",
                i18nkey: "spool.fields.material",
                filterValueQuery: useSpoolmanMaterials(),
                width: 140,
              }),
              FilteredQueryColumn({
                ...commonProps,
                id: "location",
                i18ncat: "spool",
                filterValueQuery: useSpoolmanLocations(),
                width: 160,
              }),
              FilteredQueryColumn({
                ...commonProps,
                id: "lot_nr",
                i18ncat: "spool",
                filterValueQuery: useSpoolmanLotNumbers(),
                width: 160,
              }),
            ])}
          />
        </div>
      </div>
    </>
  );
};

export default SpoolSelectModal;
