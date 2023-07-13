import React from "react";
import { IResourceComponentsProps, BaseRecord } from "@refinedev/core";
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
import i18n from "../../i18n";

dayjs.extend(utc);

interface ISpoolCollapsed extends ISpool {
  filament_name: string;
}

export const SpoolList: React.FC<IResourceComponentsProps> = () => {
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
            Clear Filters
          </Button>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: allColumns.map((column) => ({
                key: column,
                label: i18n.t(`spools.fields.${column}`),
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
              Hide Columns
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
          title: "Id",
          dataSource,
          tableState,
        })}
        {SpoolIconColumn({
          id: "filament_name",
          title: "Filament",
          color: (record: ISpoolCollapsed) => record.filament.color_hex,
          dataSource,
          tableState,
        })}
        {NumberColumn({
          id: "used_weight",
          title: "Used Weight",
          unit: "g",
          decimals: 1,
          dataSource,
          tableState,
        })}
        {NumberColumn({
          id: "remaining_weight",
          title: "Estimated Remaining Weight",
          unit: "g",
          decimals: 1,
          dataSource,
          tableState,
        })}
        {FilteredColumn({
          id: "location",
          title: "Location",
          dataSource,
          tableState,
        })}
        {FilteredColumn({
          id: "lot_nr",
          title: "Lot Nr",
          dataSource,
          tableState,
        })}
        {DateColumn({
          id: "first_used",
          title: "First Used",
          dataSource,
          tableState,
        })}
        {DateColumn({
          id: "last_used",
          title: "Last Used",
          dataSource,
          tableState,
        })}
        {SortedColumn({
          id: "comment",
          title: "Comment",
          dataSource,
          tableState,
        })}
        <Table.Column
          title="Actions"
          render={(_, record: BaseRecord) => (
            <Space>
              <EditButton
                hideText
                title="Edit"
                size="small"
                recordItemId={record.id}
              />
              <ShowButton
                hideText
                title="Show"
                size="small"
                recordItemId={record.id}
              />
              <CloneButton
                hideText
                title="Clone"
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
