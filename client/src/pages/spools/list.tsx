import React from "react";
import {
  IResourceComponentsProps,
  BaseRecord,
  useTranslate,
} from "@refinedev/core";
import {
  useTable,
  List,
  EditButton,
  ShowButton,
  CloneButton,
} from "@refinedev/antd";
import { Table, Space, Button, Dropdown } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { genericSorter, typeSorters } from "../../utils/sorting";
import { genericFilterer, typeFilters } from "../../utils/filtering";
import { ISpool } from "./model";
import {
  TableState,
  useInitialTableState,
  useStoreInitialState,
} from "../../utils/saveload";
import { EditOutlined, FilterOutlined } from "@ant-design/icons";
import {
  DateColumn,
  FilteredColumn,
  NumberColumn,
  SortedColumn,
  SpoolIconColumn,
} from "../../components/column";

dayjs.extend(utc);

interface ISpoolCollapsed extends ISpool {
  filament_name: string;
}

export const SpoolList: React.FC<IResourceComponentsProps> = () => {
  const t = useTranslate();

  // Load initial state
  const initialState = useInitialTableState("spoolList");

  // Fetch data from the API
  const {
    tableProps,
    sorters,
    setSorters,
    filters,
    setFilters,
    current,
    pageSize,
    setCurrent,
    setPageSize,
  } = useTable<ISpool>({
    syncWithLocation: false,
    pagination: {
      mode: "off", // Perform pagination in antd's Table instead. Otherwise client-side sorting/filtering doesn't work.
      current: initialState.pagination.current,
      pageSize: initialState.pagination.pageSize,
    },
    sorters: {
      mode: "off", // Disable server-side sorting
      initial: initialState.sorters,
    },
    filters: {
      mode: "off", // Disable server-side filtering
      initial: initialState.filters,
    },
  });

  // Create state for the columns to show
  const allColumns: (keyof ISpoolCollapsed & string)[] = [
    "id",
    "filament_name",
    "used_weight",
    "remaining_weight",
    "location",
    "lot_nr",
    "first_used",
    "last_used",
    "comment",
  ];
  const [showColumns, setShowColumns] = React.useState<string[]>(
    initialState.showColumns ?? allColumns
  );

  // Type the sorters and filters
  const typedSorters = typeSorters<ISpoolCollapsed>(sorters);
  const typedFilters = typeFilters<ISpoolCollapsed>(filters);

  // Store state in local storage
  const tableState: TableState = {
    sorters,
    filters,
    pagination: { current, pageSize },
    showColumns,
  };
  useStoreInitialState("spoolList", tableState);

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
        return { ...element, filament_name };
      }),
    [tableProps.dataSource]
  );

  // Filter and sort the dataSource
  const filteredDataSource = React.useMemo(() => {
    const filtered = dataSource.filter(genericFilterer(typedFilters));
    filtered.sort(genericSorter(typedSorters));
    return filtered;
  }, [dataSource, typedFilters, typedSorters]);

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
                label: t(`spool.fields.${column}`),
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
      <Table
        {...tableProps}
        dataSource={filteredDataSource}
        pagination={{
          showSizeChanger: true,
          current: current,
          pageSize: pageSize,
          onChange: (page, pageSize) => {
            setCurrent(page);
            setPageSize(pageSize);
          },
        }}
        rowKey="id"
      >
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
        {NumberColumn({
          id: "used_weight",
          i18ncat: "spool",
          unit: "g",
          decimals: 1,
          dataSource,
          tableState,
        })}
        {NumberColumn({
          id: "remaining_weight",
          i18ncat: "spool",
          unit: "g",
          decimals: 1,
          defaultText: t("unknown"),
          dataSource,
          tableState,
        })}
        {FilteredColumn({
          id: "location",
          i18ncat: "spool",
          dataSource,
          tableState,
        })}
        {FilteredColumn({
          id: "lot_nr",
          i18ncat: "spool",
          dataSource,
          tableState,
        })}
        {DateColumn({
          id: "first_used",
          i18ncat: "spool",
          dataSource,
          tableState,
        })}
        {DateColumn({
          id: "last_used",
          i18ncat: "spool",
          dataSource,
          tableState,
        })}
        {SortedColumn({
          id: "comment",
          i18ncat: "spool",
          dataSource,
          tableState,
        })}
        <Table.Column
          title={t("table.actions")}
          render={(_, record: BaseRecord) => (
            <Space>
              <EditButton
                hideText
                title={t("buttons.edit")}
                size="small"
                recordItemId={record.id}
              />
              <ShowButton
                hideText
                title={t("buttons.show")}
                size="small"
                recordItemId={record.id}
              />
              <CloneButton
                hideText
                title={t("buttons.clone")}
                size="small"
                recordItemId={record.id}
              />
            </Space>
          )}
        />
      </Table>
    </List>
  );
};

export default SpoolList;
