import { useTable } from "@refinedev/antd";
import { Button, Checkbox, Col, message, Row, Space, Table } from "antd";
import { t } from "i18next";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { FilteredQueryColumn, SortedColumn, SpoolIconColumn } from "../../components/column";
import { useSpoolmanFilamentFilter, useSpoolmanMaterials } from "../../components/otherModels";
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

// Flatten related filament fields onto the row so shared table columns can sort
// and filter without reaching through nested objects.
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

  const { tableProps, sorters, filters, currentPage, pageSize } = useTable<ISpoolCollapsed>({
    resource: "spool",
    meta: {
      queryParams: {
        ["allow_archived"]: showArchived,
      },
    },
    syncWithLocation: false,
    pagination: {
      mode: "off",
      currentPage: 1,
      pageSize: 10,
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

  // Shared column helpers expect table sort/filter state in this shape.
  const tableState: TableState = {
    sorters,
    filters,
    pagination: { currentPage: currentPage, pageSize },
  };

  // Work on shallow copies so selection helpers can inspect row state without mutating
  // Refine's cached query data.
  const dataSource: ISpoolCollapsed[] = useMemo(
    () => (tableProps.dataSource || []).map((record) => ({ ...record })),
    [tableProps.dataSource],
  );

  // Bulk selection applies only to the rows currently loaded in the modal.
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

  // Memoised Set for O(1) membership checks — avoids O(n²) when dataSource and
  // selectedItems are both large (many loaded spools, many already selected).
  const selectedSet = useMemo(() => new Set(selectedItems), [selectedItems]);
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

  return (
    <>
      {contextHolder}
      <Space direction="vertical" style={{ width: "100%" }}>
        {description && <div>{description}</div>}
        <Table
          {...tableProps}
          rowKey="id"
          tableLayout="auto"
          dataSource={dataSource}
          pagination={false}
          scroll={{ y: 200 }}
          columns={removeUndefined([
            {
              width: 50,
              render: (_, item: ISpool) => (
                <Checkbox checked={selectedSet.has(item.id)} onChange={() => handleSelectItem(item.id)} />
              ),
            },
            SortedColumn({
              ...commonProps,
              id: "id",
              i18ncat: "spool",
              width: 80,
            }),
            SpoolIconColumn({
              ...commonProps,
              id: "filament.combined_name",
              dataId: "filament.combined_name",
              i18nkey: "spool.fields.filament_name",
              color: (record: ISpoolCollapsed) => record.filament.color_hex,
              filterValueQuery: useSpoolmanFilamentFilter(),
            }),
            FilteredQueryColumn({
              ...commonProps,
              id: "filament.material",
              i18nkey: "spool.fields.material",
              filterValueQuery: useSpoolmanMaterials(),
            }),
          ])}
        />
        <Row gutter={[10, 10]}>
          <Col span={12}>
            <Checkbox
              checked={isAllFilteredSelected}
              indeterminate={isSomeButNotAllFilteredSelected}
              onChange={(e) => {
                selectUnselectFiltered(e.target.checked);
              }}
            >
              {t("printing.spoolSelect.selectAll")}
            </Checkbox>
          </Col>
          <Col span={12}>
            <div style={{ float: "right" }}>
              {t("printing.spoolSelect.selectedTotal", {
                count: selectedItems.length,
              })}
            </div>
          </Col>
          <Col span={12}>
            <Checkbox
              checked={showArchived}
              onChange={(e) => {
                setShowArchived(e.target.checked);
                if (!e.target.checked) {
                  // Drop archived selections when that filter is hidden so the badge count
                  // matches the set of choices the modal is showing.
                  setSelectedItems((prevSelected) =>
                    prevSelected.filter(
                      (selected) => dataSource.find((spool) => spool.id === selected)?.archived !== true,
                    ),
                  );
                }
              }}
            >
              {t("printing.spoolSelect.showArchived")}
            </Checkbox>
          </Col>
          <Col span={24}>
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
          </Col>
        </Row>
      </Space>
    </>
  );
};

export default SpoolSelectModal;
