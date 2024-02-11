import React, { useState } from "react";
import { Modal, Table, Checkbox, Space, Row, Col, message } from "antd";
import { ISpool } from "../pages/spools/model";
import { FilteredQueryColumn, SortedColumn, SpoolIconColumn } from "./column";
import { TableState } from "../utils/saveload";
import { useTable } from "@refinedev/antd";
import { t } from "i18next";
import { useSpoolmanFilamentFilter, useSpoolmanMaterials } from "./otherModels";
import { removeUndefined } from "../utils/filtering";
import { useNavigate } from "react-router-dom";
import { IVendor } from "../pages/vendors/model";
import { IFilament } from "../pages/filaments/model";

interface Props {
  visible: boolean;
  description?: string;
  onCancel: () => void;
  onContinue: (selectedVendors: IFilament[]) => void;
}

const FilamentSelectModal: React.FC<Props> = ({ visible, description, onCancel, onContinue }) => {
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const navigate = useNavigate();

  const { tableProps, sorters, filters, current, pageSize } = useTable<IFilament>({
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
          data: data.data,
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
  const dataSource: IFilament[] = React.useMemo(
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
              render: (_, item: IFilament) => (
                <Checkbox checked={selectedItems.includes(item.id)} onChange={() => handleSelectItem(item.id)} />
              ),
            },
            SortedColumn({
              ...commonProps,
              id: "id",
              i18ncat: "vendor",
              width: 80,
            }),
            SpoolIconColumn({
              ...commonProps,
              id: "name",
              i18nkey: "spool.fields.filament_name",
              color: (record: IFilament) => record.color_hex,
              filterValueQuery: useSpoolmanFilamentFilter(),
            }),
            FilteredQueryColumn({
              ...commonProps,
              id: "material",
              i18nkey: "spool.fields.material",
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
        </Row>
      </Space>
    </Modal>
  );
};

export default FilamentSelectModal;
