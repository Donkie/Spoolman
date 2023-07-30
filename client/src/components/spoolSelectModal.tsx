import React, { useState } from "react";
import { Modal, Table, Checkbox, Space, Row, Col, message } from "antd";
import { ISpool } from "../pages/spools/model";
import { FilteredColumn, SortedColumn, SpoolIconColumn } from "./column";
import { TableState } from "../utils/saveload";
import { useTable } from "@refinedev/antd";
import { genericSorter, typeSorters } from "../utils/sorting";
import { genericFilterer, typeFilters } from "../utils/filtering";
import { t } from "i18next";

interface Props {
  visible: boolean;
  description?: string;
  onCancel: () => void;
  onContinue: (selectedSpools: ISpool[]) => void;
}

interface ISpoolCollapsed extends ISpool {
  filament_name: string;
  material?: string;
}

const SpoolSelectModal: React.FC<Props> = ({
  visible,
  description,
  onCancel,
  onContinue,
}) => {
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const { tableProps, sorters, filters, current, pageSize } = useTable<ISpool>({
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
      mode: "off",
    },
    filters: {
      mode: "off",
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
    () =>
      (tableProps.dataSource ?? []).map((element) => {
        let filament_name: string;
        if (element.filament.vendor && "name" in element.filament.vendor) {
          filament_name = `${element.filament.vendor.name} - ${element.filament.name}`;
        } else {
          filament_name =
            element.filament.name ?? element.filament.id.toString();
        }
        return {
          ...element,
          filament_name,
          material: element.filament.material,
        };
      }),
    [tableProps.dataSource]
  );

  // Type the sorters and filters
  const typedSorters = typeSorters<ISpoolCollapsed>(sorters);
  const typedFilters = typeFilters<ISpoolCollapsed>(filters);

  // Filter and sort the dataSource
  const filteredDataSource = React.useMemo(() => {
    const filtered = dataSource.filter(genericFilterer(typedFilters));
    filtered.sort(genericSorter(typedSorters));
    return filtered;
  }, [dataSource, typedFilters, typedSorters]);

  // Function to add/remove all filtered items from selected items
  const selectUnselectFiltered = (select: boolean) => {
    setSelectedItems((prevSelected) => {
      const filtered = filteredDataSource
        .map((spool) => spool.id)
        .filter((spool) => !prevSelected.includes(spool));
      return select ? [...prevSelected, ...filtered] : filtered;
    });
  };

  // Handler for selecting/unselecting individual items
  const handleSelectItem = (item: number) => {
    setSelectedItems((prevSelected) =>
      prevSelected.includes(item)
        ? prevSelected.filter((selected) => selected !== item)
        : [...prevSelected, item]
    );
  };

  // State for the select/unselect all checkbox
  const isAllFilteredSelected = filteredDataSource.every((spool) =>
    selectedItems.includes(spool.id)
  );

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
        onContinue(
          dataSource.filter((spool) => selectedItems.includes(spool.id))
        );
      }}
      width={600}
    >
      {contextHolder}
      <Space direction="vertical" style={{ width: "100%" }}>
        {description && <div>{description}</div>}
        <Table
          {...tableProps}
          rowKey="id"
          dataSource={filteredDataSource}
          pagination={false}
          scroll={{ x: "max-content", y: 200 }}
        >
          <Table.Column
            width={50}
            render={(_, item: ISpool) => (
              <Checkbox
                checked={selectedItems.includes(item.id)}
                onChange={() => handleSelectItem(item.id)}
              />
            )}
          />
          {SortedColumn({
            id: "id",
            i18ncat: "spool",
            dataSource,
            tableState,
          })}
          {SpoolIconColumn({
            id: "filament_name",
            i18ncat: "spool",
            color: (record: ISpoolCollapsed) => record.filament.color_hex,
            dataSource,
            tableState,
          })}
          {FilteredColumn({
            id: "material",
            i18ncat: "spool",
            dataSource,
            tableState,
          })}
        </Table>
        <Row>
          <Col span={12}>
            <Checkbox
              checked={isAllFilteredSelected}
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
                      (selected) =>
                        dataSource.find((spool) => spool.id === selected)
                          ?.archived !== true
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
