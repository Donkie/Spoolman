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
import { IFilament } from "./model";
import { genericSorter, typeSorters } from "../../utils/sorting";
import { genericFilterer, typeFilters } from "../../utils/filtering";
import { EditOutlined, FilterOutlined } from "@ant-design/icons";
import {
  TableState,
  useInitialTableState,
  useStoreInitialState,
} from "../../utils/saveload";
import {
  DateColumn,
  FilteredColumn,
  NumberColumn,
  SortedColumn,
  SpoolIconColumn,
} from "../../components/column";
import i18n from "../../i18n";

dayjs.extend(utc);

interface IFilamentCollapsed extends Omit<IFilament, "vendor"> {
  vendor_name: string | null;
}

export const FilamentList: React.FC<IResourceComponentsProps> = () => {
  // Load initial state
  const initialState = useInitialTableState("filamentList");

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
  } = useTable<IFilament>({
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
  const allColumns: (keyof IFilamentCollapsed & string)[] = [
    "id",
    "vendor_name",
    "name",
    "material",
    "price",
    "density",
    "diameter",
    "weight",
    "spool_weight",
    "article_number",
    "registered",
    "comment",
  ];
  const [showColumns, setShowColumns] = React.useState<string[]>(
    initialState.showColumns ?? allColumns
  );

  // Type the sorters and filters
  const typedSorters = typeSorters<IFilamentCollapsed>(sorters);
  const typedFilters = typeFilters<IFilamentCollapsed>(filters);

  // Store state in local storage
  const tableState: TableState = {
    sorters,
    filters,
    pagination: { current, pageSize },
    showColumns,
  };
  useStoreInitialState("filamentList", tableState);

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
        return { ...element, vendor_name };
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
              items: allColumns.map((column_id) => ({
                key: column_id,
                label: i18n.t(`filaments.fields.${column_id}`),
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
        {FilteredColumn({
          id: "vendor_name",
          title: "Vendor",
          dataSource,
          tableState,
        })}
        {SpoolIconColumn({
          id: "name",
          title: "Name",
          color: (record: IFilamentCollapsed) => record.color_hex,
          dataSource,
          tableState,
        })}
        {FilteredColumn({
          id: "material",
          title: "Material",
          dataSource,
          tableState,
        })}
        {SortedColumn({
          id: "price",
          title: "Price",
          dataSource,
          tableState,
        })}
        {NumberColumn({
          id: "density",
          title: "Density",
          unit: "g/cm³",
          decimals: 2,
          dataSource,
          tableState,
        })}
        {NumberColumn({
          id: "diameter",
          title: "Diameter",
          unit: "mm",
          decimals: 2,
          dataSource,
          tableState,
        })}
        {NumberColumn({
          id: "weight",
          title: "Weight",
          unit: "g",
          decimals: 1,
          dataSource,
          tableState,
        })}
        {NumberColumn({
          id: "spool_weight",
          title: "Spool Weight",
          unit: "g",
          decimals: 1,
          dataSource,
          tableState,
        })}
        {FilteredColumn({
          id: "article_number",
          title: "Article Number",
          dataSource,
          tableState,
        })}
        {DateColumn({
          id: "registered",
          title: "Registered",
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
          dataIndex="actions"
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
