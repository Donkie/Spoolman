import React from "react";
import { IResourceComponentsProps, BaseRecord, useTranslate, useInvalidate } from "@refinedev/core";
import { useTable, List, EditButton, ShowButton, CloneButton } from "@refinedev/antd";
import { Table, Space, Button, Dropdown } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { IFilament } from "./model";
import { EditOutlined, FilterOutlined, ShareAltOutlined } from "@ant-design/icons";
import { TableState, shareSavedState, useInitialTableState, useStoreInitialState } from "../../utils/saveload";
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
import { useLiveify } from "../../components/liveify";

dayjs.extend(utc);

interface IFilamentCollapsed extends Omit<IFilament, "vendor"> {
  "vendor.name": string | null;
}

function collapseFilament(element: IFilament): IFilamentCollapsed {
  let vendor_name: string | null;
  if (element.vendor) {
    vendor_name = element.vendor.name;
  } else {
    vendor_name = null;
  }
  return { ...element, "vendor.name": vendor_name };
}

function translateColumnI18nKey(columnName: string): string {
  columnName = columnName.replace(".", "_");
  return `filament.fields.${columnName}`;
}

const namespace = "filamentList-v2";

export const FilamentList: React.FC<IResourceComponentsProps> = () => {
  const t = useTranslate();
  const invalidate = useInvalidate();

  // Load initial state
  const initialState = useInitialTableState(namespace);

  // Fetch data from the API
  // To provide the live updates, we use a custom solution (useLiveify) instead of the built-in refine "liveMode" feature.
  // This is because the built-in feature does not call the liveProvider subscriber with a list of IDs, but instead
  // calls it with a list of filters, sorters, etc. This means the server-side has to support this, which is quite hard.
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
    liveMode: "manual",
    onLiveEvent(event) {
      if (event.type === "created" || event.type === "deleted") {
        // updated is handled by the liveify
        invalidate({
          resource: "filament",
          invalidates: ["list"],
        });
      }
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
  const queryDataSource: IFilamentCollapsed[] = React.useMemo(
    () => (tableProps.dataSource ?? []).map(collapseFilament),
    [tableProps.dataSource]
  );
  const dataSource = useLiveify("filament", queryDataSource, collapseFilament);

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
                label: t(translateColumnI18nKey(column_id)),
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
          <Button type="primary" icon={<ShareAltOutlined />} onClick={() => {
            let url = shareSavedState("filamentList-v2");
            try {
              if (navigator.canShare()) {
                navigator.share({ url: url });
              } else {
                window.location.hash = url.split("#")[1]
              }
            } catch (err) {
              console.error(err);
            }
          }}>
            {t("buttons.share")}
          </Button>
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
