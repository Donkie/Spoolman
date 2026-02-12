import { useTable } from "@refinedev/antd";
import { CrudFilter } from "@refinedev/core";
import { Button, Checkbox, Col, Input, message, Pagination, Row, Space, Table } from "antd";
import { t } from "i18next";
import { useEffect, useMemo, useState } from "react";
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

const SpoolSelectModal = ({ description, initialSelectedIds, onExport, onPrint }: Props) => {
  const [selectedItems, setSelectedItems] = useState<number[]>(initialSelectedIds ?? []);
  const [showArchived, setShowArchived] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState("");
  const [selectedArchivedMap, setSelectedArchivedMap] = useState<Record<number, boolean>>({});

  const { tableProps, sorters, filters, setFilters, currentPage, pageSize, setCurrentPage, setPageSize } =
    useTable<ISpoolCollapsed>({
    resource: "spool",
    meta: {
      queryParams: {
        ["allow_archived"]: showArchived,
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

  // Store state in local storage
  const tableState: TableState = {
    sorters,
    filters,
    pagination: { currentPage: currentPage, pageSize },
  };

  // Collapse the dataSource to a mutable list and add a filament_name field
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

  const paginationTotal = tableProps.pagination ? tableProps.pagination.total ?? 0 : 0;
  const handlePageChange = (page: number, nextPageSize?: number) => {
    if (typeof nextPageSize === "number" && nextPageSize !== pageSize) {
      setPageSize(nextPageSize);
    }
    setCurrentPage(page);
  };
  const handlePageSizeChange = (_current: number, size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const applySearchFilter = (nextSearch: string) => {
    const trimmedSearch = nextSearch.trim();
    const nextFilters: CrudFilter[] = [];
    (filters ?? []).forEach((filter) => {
      if ("field" in filter && filter.field !== "search") {
        nextFilters.push(filter);
      }
    });
    if (trimmedSearch.length > 0) {
      nextFilters.push({
        field: "search",
        operator: "contains",
        value: [trimmedSearch],
      });
    }
    setFilters(nextFilters, "replace");
    setCurrentPage(1);
  };

  // Function to add/remove all filtered items from selected items
  const selectUnselectFiltered = (select: boolean) => {
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
  };

  // Handler for selecting/unselecting individual items
  const handleSelectItem = (item: number) => {
    setSelectedItems((prevSelected) =>
      prevSelected.includes(item) ? prevSelected.filter((selected) => selected !== item) : [...prevSelected, item],
    );
  };

  // State for the select/unselect all checkbox
  const isAllFilteredSelected = dataSource.every((spool) => selectedSet.has(spool.id));
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

  return (
    <>
      {contextHolder}
      <div style={{ width: "100%", display: "flex", flexDirection: "column", height: "100%" }}>
        {(description || tableProps.pagination) && (
          <Row gutter={[12, 8]} align="middle" style={{ marginBottom: 8 }}>
            <Col flex="auto">{description && <div style={{ margin: 0 }}>{description}</div>}</Col>
            {tableProps.pagination && (
              <Col flex="none">
                <Pagination
                  size="small"
                  current={currentPage}
                  pageSize={pageSize}
                  total={paginationTotal}
                  showSizeChanger
                  pageSizeOptions={["25", "50", "100", "200"]}
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
              placeholder={t("printing.spoolSelect.searchPlaceholder")}
              value={searchValue}
              allowClear
              enterButton
              onChange={(event) => {
                const value = event.target.value;
                setSearchValue(value);
                if (value === "") {
                  applySearchFilter("");
                }
              }}
              onSearch={(value) => {
                setSearchValue(value);
                applySearchFilter(value);
              }}
            />
          </Col>
        </Row>
        <Row gutter={[12, 12]} align="middle" style={{ marginBottom: 8 }}>
          <Col flex="none">
            <Button
              onClick={() => {
                setSearchValue("");
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
                    // Remove archived spools from selected items
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
        <div style={{ flex: 1, minHeight: 0 }}>
          <Table
            {...tableProps}
            rowKey="id"
            tableLayout="fixed"
            pagination={false}
            dataSource={dataSource}
            scroll={{ y: "calc(100vh - 360px)", x: "max-content" }}
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
                ellipsis: true,
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
                ellipsis: true,
              }),
              FilteredQueryColumn({
                ...commonProps,
                id: "location",
                i18ncat: "spool",
                filterValueQuery: useSpoolmanLocations(),
                width: 160,
                ellipsis: true,
              }),
              FilteredQueryColumn({
                ...commonProps,
                id: "lot_nr",
                i18ncat: "spool",
                filterValueQuery: useSpoolmanLotNumbers(),
                width: 160,
                ellipsis: true,
              }),
            ])}
          />
        </div>
      </div>
    </>
  );
};

export default SpoolSelectModal;
