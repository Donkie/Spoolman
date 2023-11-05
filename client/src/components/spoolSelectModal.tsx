import React, { useState } from "react";
import { Modal, Table, Checkbox, Space, Row, Col, message } from "antd";
import { ISpool } from "../pages/spools/model";
import { FilteredQueryColumn, SortedColumn, SpoolIconColumn } from "./column";
import { TableState } from "../utils/saveload";
import { useTable } from "@refinedev/antd";
import { t } from "i18next";
import { useSpoolmanFilamentFilter, useSpoolmanMaterials } from "./otherModels";
import { removeUndefined } from "../utils/filtering";

interface Props {
  visible: boolean;
  description?: string;
  onCancel: () => void;
  onContinue: (selectedSpools: ISpool[]) => void;
}

interface ISpoolCollapsed extends ISpool {
  combined_name: string;
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
    combined_name: filament_name,
    "filament.id": element.filament.id,
    "filament.material": element.filament.material,
  };
}

const SpoolSelectModal: React.FC<Props> = ({ visible, description, onCancel, onContinue }) => {
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const { tableProps, sorters, filters, current, pageSize } = useTable<ISpoolCollapsed>({
    meta: {
      queryParams: {
        ["allow_archived"]: showArchived,
      },
    },
    syncWithLocation: false,
    pagination: {
      mode: "off",
      current: 1,
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

  // Store state in local storage
  const tableState: TableState = {
    sorters,
    filters,
    pagination: { current, pageSize },
  };

  // Collapse the dataSource to a mutable list and add a filament_name field
  const dataSource: ISpoolCollapsed[] = React.useMemo(
    () => (tableProps.dataSource || []).map((record) => ({ ...record })),
    [tableProps.dataSource]
  );

  // Function to add/remove all filtered items from selected items
  const selectUnselectFiltered = (select: boolean) => {
    setSelectedItems((prevSelected) => {
      const filtered = dataSource.map((spool) => spool.id).filter((spool) => !prevSelected.includes(spool));
      return select ? [...prevSelected, ...filtered] : filtered;
    });
  };

  // Handler for selecting/unselecting individual items
  const handleSelectItem = (item: number) => {
    setSelectedItems((prevSelected) =>
      prevSelected.includes(item) ? prevSelected.filter((selected) => selected !== item) : [...prevSelected, item]
    );
  };

  // State for the select/unselect all checkbox
  const isAllFilteredSelected = dataSource.every((spool) => selectedItems.includes(spool.id));
  const isSomeButNotAllFilteredSelected =
    dataSource.some((spool) => selectedItems.includes(spool.id)) && !isAllFilteredSelected;

  return (
    <Modal
      title={t("printing.spoolSelect.title")}
      open={visible}
      onCancel={onCancel}
      onOk={() => {
        if (selectedItems.length === 0) {
          messageApi.open({
            type: "error",
            content: t("printing.spoolSelect.noSpoolsSelected"),
          });
          return;
        }
        onContinue(dataSource.filter((spool) => selectedItems.includes(spool.id)));
      }}
      width={600}
    >
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
                <Checkbox checked={selectedItems.includes(item.id)} onChange={() => handleSelectItem(item.id)} />
              ),
            },
            SortedColumn({
              id: "id",
              i18ncat: "spool",
              dataSource,
              tableState,
              width: 80,
            }),
            SpoolIconColumn({
              id: "combined_name",
              dataId: "filament.id",
              i18nkey: "spool.fields.filament_name",
              color: (record: ISpoolCollapsed) => record.filament.color_hex,
              dataSource,
              tableState,
              filterValueQuery: useSpoolmanFilamentFilter(),
            }),
            FilteredQueryColumn({
              id: "filament.material",
              i18nkey: "spool.fields.material",
              dataSource,
              tableState,
              filterValueQuery: useSpoolmanMaterials(),
            }),
          ])}
        />
        <Row>
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
                  // Remove archived spools from selected items
                  setSelectedItems((prevSelected) =>
                    prevSelected.filter(
                      (selected) => dataSource.find((spool) => spool.id === selected)?.archived !== true
                    )
                  );
                }
              }}
            >
              {t("printing.spoolSelect.showArchived")}
            </Checkbox>
          </Col>
        </Row>
      </Space>
    </Modal>
  );
};

export default SpoolSelectModal;
