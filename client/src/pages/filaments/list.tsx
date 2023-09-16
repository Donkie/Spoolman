import React from "react";
import { IResourceComponentsProps, BaseRecord, useTranslate } from "@refinedev/core";
import { useTable, List, EditButton, ShowButton, CloneButton } from "@refinedev/antd";
import { Table, Space, Button, Dropdown } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { IFilament } from "./model";
import { EditOutlined, FilterOutlined } from "@ant-design/icons";
import { TableState, useInitialTableState, useStoreInitialState } from "../../utils/saveload";
import {
  DateColumn,
  FilteredQueryColumn,
  NumberColumn,
  RichColumn,
  SortedColumn,
  SpoolIconColumn,
} from "../../components/column";
import {
  useSpoolmanArticleNumbers,
  useSpoolmanFilamentNames,
  useSpoolmanMaterials,
  useSpoolmanVendors,
} from "../../components/otherModels";

dayjs.extend(utc);

interface IFilamentCollapsed extends Omit<IFilament, "vendor"> {
  "vendor.name": string | null;
}

const namespace = "filamentList-v2";

export const FilamentList: React.FC<IResourceComponentsProps> = () => {
  const t = useTranslate();

  // Load initial state
  const initialState = useInitialTableState(namespace);

  // Fetch data from the API
  const { tableProps, sorters, setSorters, filters, setFilters, current, pageSize, setCurrent } = useTable<IFilament>({
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
  const allColumns: (keyof IFilamentCollapsed & string)[] = [
    "id",
    "vendor.name",
    "name",
    "material",
    "price",
    "density",
    "diameter",
    "weight",
    "spool_weight",
    "article_number",
    "settings_extruder_temp",
    "settings_bed_temp",
    "registered",
    "comment",
  ];
  const defaultColumns = allColumns.filter(
    (column_id) => ["registered", "density", "diameter", "spool_weight"].indexOf(column_id) === -1
  );

  const [showColumns, setShowColumns] = React.useState<string[]>(initialState.showColumns ?? defaultColumns);

  // Store state in local storage
  const tableState: TableState = {
    sorters,
    filters,
    pagination: { current, pageSize },
    showColumns,
  };
  useStoreInitialState(namespace, tableState);

  // Collapse the dataSource to a mutable list and add a filament_name field
  const dataSource: IFilamentCollapsed[] = React.useMemo(
    () =>
      (tableProps.dataSource ?? []).map((element) => {
        let vendor_name: string | null;
        if (element.vendor) {
          vendor_name = element.vendor.name;
        } else {
          vendor_name = null;
        }
        return { ...element, "vendor.name": vendor_name };
      }),
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
              items: allColumns.map((column_id) => ({
                key: column_id,
                label: t(`filament.fields.${column_id.replace(".", "_")}`),
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
          i18ncat: "filament",
          dataSource,
          tableState,
        })}
        {FilteredQueryColumn({
          id: "vendor.name",
          i18nkey: "filament.fields.vendor_name",
          dataSource,
          tableState,
          filterValueQuery: useSpoolmanVendors(),
        })}
        {SpoolIconColumn({
          id: "name",
          i18ncat: "filament",
          color: (record: IFilamentCollapsed) => record.color_hex,
          dataSource,
          tableState,
          filterValueQuery: useSpoolmanFilamentNames(),
        })}
        {FilteredQueryColumn({
          id: "material",
          i18ncat: "filament",
          dataSource,
          tableState,
          filterValueQuery: useSpoolmanMaterials(),
        })}
        {SortedColumn({
          id: "price",
          i18ncat: "filament",
          dataSource,
          tableState,
        })}
        {NumberColumn({
          id: "density",
          i18ncat: "filament",
          unit: "g/cm³",
          decimals: 2,
          dataSource,
          tableState,
        })}
        {NumberColumn({
          id: "diameter",
          i18ncat: "filament",
          unit: "mm",
          decimals: 2,
          dataSource,
          tableState,
        })}
        {NumberColumn({
          id: "weight",
          i18ncat: "filament",
          unit: "g",
          decimals: 1,
          dataSource,
          tableState,
        })}
        {NumberColumn({
          id: "spool_weight",
          i18ncat: "filament",
          unit: "g",
          decimals: 1,
          dataSource,
          tableState,
        })}
        {FilteredQueryColumn({
          id: "article_number",
          i18ncat: "filament",
          dataSource,
          tableState,
          filterValueQuery: useSpoolmanArticleNumbers(),
        })}
        {NumberColumn({
          id: "settings_extruder_temp",
          i18ncat: "filament",
          unit: "°C",
          decimals: 0,
          dataSource,
          tableState,
        })}
        {NumberColumn({
          id: "settings_bed_temp",
          i18ncat: "filament",
          unit: "°C",
          decimals: 0,
          dataSource,
          tableState,
        })}
        {DateColumn({
          id: "registered",
          i18ncat: "filament",
          dataSource,
          tableState,
        })}
        {RichColumn({
          id: "comment",
          i18ncat: "filament",
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

export default FilamentList;
