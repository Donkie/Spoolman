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
import { IVendor } from "./model";
import {
  TableState,
  useInitialTableState,
  useStoreInitialState,
} from "../../utils/saveload";
import { EditOutlined, FilterOutlined } from "@ant-design/icons";
import i18n from "../../i18n";
import { DateColumn, SortedColumn } from "../../components/column";

dayjs.extend(utc);

export const VendorList: React.FC<IResourceComponentsProps> = () => {
  // Load initial state
  const initialState = useInitialTableState("vendorList");

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
  } = useTable<IVendor>({
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
  const allColumns: (keyof IVendor & string)[] = [
    "id",
    "name",
    "registered",
    "comment",
  ];
  const [showColumns, setShowColumns] = React.useState<string[]>(
    initialState.showColumns ?? allColumns
  );

  // Type the sorters and filters
  const typedSorters = typeSorters<IVendor>(sorters);
  const typedFilters = typeFilters<IVendor>(filters);

  // Store state in local storage
  const tableState: TableState = {
    sorters,
    filters,
    pagination: { current, pageSize },
    showColumns,
  };
  useStoreInitialState("vendorList", tableState);

  // Collapse the dataSource to a mutable list
  const dataSource: IVendor[] = React.useMemo(
    () => (tableProps.dataSource || []).map((record) => ({ ...record })),
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
                label: i18n.t(`vendors.fields.${column}`),
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
        {SortedColumn({
          id: "name",
          title: "Name",
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
