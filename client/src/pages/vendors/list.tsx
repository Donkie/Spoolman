import React from "react";
import { IResourceComponentsProps, BaseRecord } from "@refinedev/core";
import {
  useTable,
  List,
  EditButton,
  ShowButton,
  DateField,
  CloneButton,
} from "@refinedev/antd";
import { Table, Space, Button } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import {
  genericSorter,
  getSortOrderForField,
  typeSorters,
} from "../../utils/sorting";
import { genericFilterer, typeFilters } from "../../utils/filtering";
import { IVendor } from "./model";
import {
  useInitialTableState,
  useStoreInitialState,
} from "../../utils/saveload";
import { FilterOutlined } from "@ant-design/icons";

dayjs.extend(utc);

export const VendorList: React.FC<IResourceComponentsProps> = () => {
  // Load initial state
  const initialState = useInitialTableState("vendorList");

  // Fetch data from the API
  const { tableProps, sorters, filters, setSorters, setFilters } =
    useTable<IVendor>({
      syncWithLocation: false,
      pagination: {
        mode: "off", // Perform pagination in antd's Table instead. Otherwise client-side sorting/filtering doesn't work.
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

  // Type the sorters and filters
  const typedSorters = typeSorters<IVendor>(sorters);
  const typedFilters = typeFilters<IVendor>(filters);

  // Store state in local storage
  useStoreInitialState("vendorList", { sorters, filters });

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
            }}
          >
            Clear Filters
          </Button>
          {defaultButtons}
        </>
      )}
    >
      <Table
        {...tableProps}
        dataSource={filteredDataSource}
        pagination={{ showSizeChanger: true, pageSize: 20 }}
        rowKey="id"
      >
        <Table.Column
          dataIndex="id"
          title="Id"
          sorter={true}
          sortOrder={getSortOrderForField(typedSorters, "id")}
        />
        <Table.Column
          dataIndex="name"
          title="Name"
          sorter={true}
          sortOrder={getSortOrderForField(typedSorters, "name")}
        />
        <Table.Column
          dataIndex={["registered"]}
          title="Registered"
          sorter={true}
          sortOrder={getSortOrderForField(typedSorters, "registered")}
          render={(value) => (
            <DateField
              value={dayjs.utc(value).local()}
              title={dayjs.utc(value).local().format()}
              format="YYYY-MM-DD HH:mm:ss"
            />
          )}
        />
        <Table.Column
          dataIndex={["comment"]}
          title="Comment"
          sorter={true}
          sortOrder={getSortOrderForField(typedSorters, "comment")}
        />
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
