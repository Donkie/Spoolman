import React from "react";
import { IResourceComponentsProps, BaseRecord, useTranslate } from "@refinedev/core";
import { useTable, List, EditButton, ShowButton, CloneButton } from "@refinedev/antd";
import { Table, Space, Button, Dropdown } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { IVendor } from "./model";
import { TableState, useInitialTableState, useStoreInitialState } from "../../utils/saveload";
import { EditOutlined, FilterOutlined } from "@ant-design/icons";
import { DateColumn, RichColumn, SortedColumn } from "../../components/column";

dayjs.extend(utc);

const namespace = "vendorList-v2";

export const VendorList: React.FC<IResourceComponentsProps> = () => {
  const t = useTranslate();

  // Load initial state
  const initialState = useInitialTableState(namespace);

  // Fetch data from the API
  const { tableProps, sorters, setSorters, filters, setFilters, current, pageSize, setCurrent } = useTable<IVendor>({
    syncWithLocation: false,
    pagination: {
      mode: "server",
      current: initialState.pagination.current,
      pageSize: initialState.pagination.pageSize,
    },
    sorters: {
      mode: "server",
      initial: initialState.sorters,
    },
    filters: {
      mode: "server",
      initial: initialState.filters,
    },
  });

  // Create state for the columns to show
  const allColumns: (keyof IVendor & string)[] = ["id", "name", "registered", "comment"];
  const [showColumns, setShowColumns] = React.useState<string[]>(initialState.showColumns ?? allColumns);

  // Store state in local storage
  const tableState: TableState = {
    sorters,
    filters,
    pagination: { current, pageSize },
    showColumns,
  };
  useStoreInitialState(namespace, tableState);

  // Collapse the dataSource to a mutable list
  const dataSource: IVendor[] = React.useMemo(
    () => (tableProps.dataSource || []).map((record) => ({ ...record })),
    [tableProps.dataSource]
  );

  if (tableProps.pagination) {
    tableProps.pagination.showSizeChanger = true;
  }

  return (
    <List
      headerButtons={({ defaultButtons }) => (
        <>
          <Button
            type="primary"
            icon={<FilterOutlined />}
            onClick={() => {
              setFilters([], "replace");
              setSorters([{ field: "id", order: "asc" }]);
              setCurrent(1);
            }}
          >
            {t("buttons.clearFilters")}
          </Button>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: allColumns.map((column) => ({
                key: column,
                label: t(`vendor.fields.${column}`),
              })),
              selectedKeys: showColumns,
              selectable: true,
              multiple: true,
              onDeselect: (keys) => {
                setShowColumns(keys.selectedKeys);
              },
              onSelect: (keys) => {
                setShowColumns(keys.selectedKeys);
              },
            }}
          >
            <Button type="primary" icon={<EditOutlined />}>
              {t("buttons.hideColumns")}
            </Button>
          </Dropdown>
          {defaultButtons}
        </>
      )}
    >
      <Table {...tableProps} dataSource={dataSource} rowKey="id">
        {SortedColumn({
          id: "id",
          i18ncat: "vendor",
          dataSource,
          tableState,
        })}
        {SortedColumn({
          id: "name",
          i18ncat: "vendor",
          dataSource,
          tableState,
        })}
        {DateColumn({
          id: "registered",
          i18ncat: "vendor",
          dataSource,
          tableState,
        })}
        {RichColumn({
          id: "comment",
          i18ncat: "vendor",
          dataSource,
          tableState,
        })}
        <Table.Column
          title={t("table.actions")}
          render={(_, record: BaseRecord) => (
            <Space>
              <EditButton hideText title={t("buttons.edit")} size="small" recordItemId={record.id} />
              <ShowButton hideText title={t("buttons.show")} size="small" recordItemId={record.id} />
              <CloneButton hideText title={t("buttons.clone")} size="small" recordItemId={record.id} />
            </Space>
          )}
        />
      </Table>
    </List>
  );
};

export default VendorList;
