import { EditOutlined, EyeOutlined, FileOutlined, FilterOutlined, PlusSquareOutlined } from "@ant-design/icons";
import { List, useTable } from "@refinedev/antd";
import { useInvalidate, useNavigation, useTranslate } from "@refinedev/core";
import { Button, Dropdown, Table } from "antd";
import { ColumnType } from "antd/es/table";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  ActionsColumn,
  CustomFieldColumn,
  DateColumn,
  FilteredQueryColumn,
  NumberColumn,
  RichColumn,
  SortedColumn,
  SpoolIconColumn,
} from "../../components/column";
import { useLiveify } from "../../components/liveify";
import { buildFormulaValues, formatFormulaValue, getFormulaFieldsForSurface } from "../../utils/formulaFields";
import {
  useSpoolmanArticleNumbers,
  useSpoolmanFilamentNames,
  useSpoolmanMaterials,
  useSpoolmanVendors,
} from "../../components/otherModels";
import { removeUndefined } from "../../utils/filtering";
import { FormulaFieldSurface, EntityType, useGetDerivedFields, useGetFields } from "../../utils/queryFields";
import { TableState, useInitialTableState, useSavedState, useStoreInitialState } from "../../utils/saveload";
import { useCurrencyFormatter } from "../../utils/settings";
import { IFilament } from "./model";

dayjs.extend(utc);

interface IFilamentCollapsed extends Omit<IFilament, "vendor"> {
  "vendor.name": string | null;
  derived?: Record<string, unknown>;
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
  (column_id) => ["registered", "density", "diameter", "spool_weight"].indexOf(column_id) === -1,
);

export const FilamentList = () => {
  const t = useTranslate();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const extraFields = useGetFields(EntityType.filament);
  const formulaFields = useGetDerivedFields(EntityType.filament);
  const currencyFormatter = useCurrencyFormatter();

  // Load initial state
  const initialState = useInitialTableState(namespace);
  // Track formula-column hides separately so newly enabled toggleable fields still default to visible.
  const [hiddenDerivedColumns, setHiddenDerivedColumns] = useSavedState<string[]>(`${namespace}-hiddenDerivedColumns`, []);

  // Fetch data from the API
  // To provide the live updates, we use a custom solution (useLiveify) instead of the built-in refine "liveMode" feature.
  // This is because the built-in feature does not call the liveProvider subscriber with a list of IDs, but instead
  // calls it with a list of filters, sorters, etc. This means the server-side has to support this, which is quite hard.
  const { tableProps, sorters, setSorters, filters, setFilters, currentPage, pageSize, setCurrentPage } =
    useTable<IFilamentCollapsed>({
      syncWithLocation: false,
      pagination: {
        mode: "server",
        currentPage: initialState.pagination.currentPage,
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
      queryOptions: {
        select(data) {
          return {
            total: data.total,
            data: data.data.map(collapseFilament),
          };
        },
      },
    });

  // Create state for the columns to show
  const [showColumns, setShowColumns] = useState<string[]>(initialState.showColumns ?? defaultColumns);

  // Store state in local storage
  const tableState: TableState = {
    sorters,
    filters,
    pagination: { currentPage: currentPage, pageSize },
    showColumns,
  };
  useStoreInitialState(namespace, tableState);

  // Collapse the dataSource to a mutable list
  const queryDataSource: IFilamentCollapsed[] = useMemo(
    () => (tableProps.dataSource || []).map((record) => ({ ...record })),
    [tableProps.dataSource],
  );
  const liveDataSource = useLiveify("filament", queryDataSource, collapseFilament);
  const listFormulaFields = useMemo(
    () => getFormulaFieldsForSurface(formulaFields.data, FormulaFieldSurface.list),
    [formulaFields.data],
  );
  // All list-surface formula fields are eligible for hide/show in the column picker,
  // so we map every list formula to its derived column key here.
  const toggleableDerivedColumnKeys = useMemo(
    () => listFormulaFields.map((field) => `derived.${field.key}`),
    [listFormulaFields],
  );
  const allColumnsWithExtraFields = useMemo(
    () => [
      ...allColumns,
      ...(extraFields.data?.map((field) => `extra.${field.key}`) ?? []),
      ...toggleableDerivedColumnKeys,
    ],
    [extraFields.data, toggleableDerivedColumnKeys],
  );
  const selectedColumnKeys = useMemo(
    () => [...showColumns, ...toggleableDerivedColumnKeys.filter((key) => !hiddenDerivedColumns.includes(key))],
    [hiddenDerivedColumns, showColumns, toggleableDerivedColumnKeys],
  );
  const dataSource = useMemo<IFilamentCollapsed[]>(
    () =>
      liveDataSource.map((record) => ({
        ...record,
        // Formula values are computed client-side from the fetched row and are not persisted
        // server-side fields, so they update on reload/live row updates and remain display-only.
        derived: buildFormulaValues(record, listFormulaFields),
      })),
    [liveDataSource, listFormulaFields],
  );

  if (tableProps.pagination) {
    tableProps.pagination.showSizeChanger = true;
  }

  const { editUrl, showUrl, cloneUrl } = useNavigation();
  const filamentAddSpoolUrl = (id: number): string => `/spool/create?filament_id=${id}`;
  const actions = (record: IFilamentCollapsed) => [
    { name: t("buttons.show"), icon: <EyeOutlined />, link: showUrl("filament", record.id) },
    { name: t("buttons.edit"), icon: <EditOutlined />, link: editUrl("filament", record.id) },
    { name: t("buttons.clone"), icon: <PlusSquareOutlined />, link: cloneUrl("filament", record.id) },
    { name: t("filament.buttons.add_spool"), icon: <FileOutlined />, link: filamentAddSpoolUrl(record.id) },
  ];

  const commonProps = {
    t,
    navigate,
    actions,
    dataSource,
    tableState,
    sorter: true,
  };

  const updateColumnSelections = (selectedKeys: string[]) => {
    // Persist core column visibility separately from derived-column visibility so
    // derived keys can be toggled without rewriting the base showColumns state.
    setShowColumns(selectedKeys.filter((key) => !toggleableDerivedColumnKeys.includes(key)));
    setHiddenDerivedColumns(toggleableDerivedColumnKeys.filter((key) => !selectedKeys.includes(key)));
  };

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
              setCurrentPage(1);
            }}
          >
            {t("buttons.clearFilters")}
          </Button>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: allColumnsWithExtraFields.map((column_id) => {
                if (column_id.indexOf("extra.") === 0) {
                  const extraField = extraFields.data?.find((field) => "extra." + field.key === column_id);
                  return {
                    key: column_id,
                    label: extraField?.name ?? column_id,
                  };
                }
                if (column_id.indexOf("derived.") === 0) {
                  const formulaField = listFormulaFields.find((field) => `derived.${field.key}` === column_id);
                  return {
                    key: column_id,
                    label: formulaField?.name ?? column_id,
                  };
                }

                return {
                  key: column_id,
                  label: t(translateColumnI18nKey(column_id)),
                };
              }),
              selectedKeys: selectedColumnKeys,
              selectable: true,
              multiple: true,
              onDeselect: (keys) => {
                updateColumnSelections(keys.selectedKeys.map(String));
              },
              onSelect: (keys) => {
                updateColumnSelections(keys.selectedKeys.map(String));
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
      <Table<IFilamentCollapsed>
        {...tableProps}
        sticky
        tableLayout="auto"
        scroll={{ x: "max-content" }}
        dataSource={dataSource}
        rowKey="id"
        columns={removeUndefined([
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
          }),
          SpoolIconColumn({
            ...commonProps,
            id: "name",
            i18ncat: "filament",
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
            width: 110,
          }),
          SortedColumn({
            ...commonProps,
            id: "price",
            i18ncat: "filament",
            align: "right",
            width: 80,
            render: (_, obj: IFilamentCollapsed) => {
              if (obj.price === undefined) {
                return "";
              }
              return currencyFormatter.format(obj.price);
            },
          }),
          NumberColumn({
            ...commonProps,
            id: "density",
            i18ncat: "filament",
            unit: "g/cm³",
            maxDecimals: 2,
            width: 100,
          }),
          NumberColumn({
            ...commonProps,
            id: "diameter",
            i18ncat: "filament",
            unit: "mm",
            maxDecimals: 2,
            width: 100,
          }),
          NumberColumn({
            ...commonProps,
            id: "weight",
            i18ncat: "filament",
            unit: "g",
            maxDecimals: 0,
            width: 100,
          }),
          NumberColumn({
            ...commonProps,
            id: "spool_weight",
            i18ncat: "filament",
            unit: "g",
            maxDecimals: 0,
            width: 100,
          }),
          FilteredQueryColumn({
            ...commonProps,
            id: "article_number",
            i18ncat: "filament",
            filterValueQuery: useSpoolmanArticleNumbers(),
            width: 130,
          }),
          NumberColumn({
            ...commonProps,
            id: "settings_extruder_temp",
            i18ncat: "filament",
            unit: "°C",
            maxDecimals: 0,
            width: 100,
          }),
          NumberColumn({
            ...commonProps,
            id: "settings_bed_temp",
            i18ncat: "filament",
            unit: "°C",
            maxDecimals: 0,
            width: 100,
          }),
          DateColumn({
            ...commonProps,
            id: "registered",
            i18ncat: "filament",
          }),
          ...(extraFields.data?.map((field) => {
            return CustomFieldColumn({
              ...commonProps,
              field,
            });
          }) ?? []),
          ...listFormulaFields.map(
            (field) => {
              const derivedColumnKey = `derived.${field.key}`;
              if (hiddenDerivedColumns.includes(derivedColumnKey)) {
                return undefined;
              }

              return {
                key: derivedColumnKey,
                title: field.name,
                width: 140,
                render: (_: unknown, record: IFilamentCollapsed) => formatFormulaValue(record.derived?.[field.key]),
              } as ColumnType<IFilamentCollapsed>;
            },
          ),
          RichColumn({
            ...commonProps,
            id: "comment",
            i18ncat: "filament",
            width: 150,
          }),
          ActionsColumn(t("table.actions"), actions),
        ])}
      />
    </List>
  );
};

export default FilamentList;
