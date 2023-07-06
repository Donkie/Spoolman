import React from "react";
import { IResourceComponentsProps, BaseRecord } from "@refinedev/core";
import {
  useTable,
  List,
  EditButton,
  ShowButton,
  DateField,
  TextField,
  CloneButton,
} from "@refinedev/antd";
import { Table, Space, Button } from "antd";
import { NumberFieldUnit } from "../../components/numberField";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import {
  filterPopulator,
  genericFilterer,
  genericSorter,
  getFiltersForField,
  getSortOrderForField,
} from "../../utils/sorting";
import { ISpool } from "./model";
import {
  useInitialTableState,
  useStoreInitialState,
} from "../../utils/saveload";
import { FilterOutlined } from "@ant-design/icons";

dayjs.extend(utc);

export const SpoolList: React.FC<IResourceComponentsProps> = () => {
  // Load initial state
  const initialState = useInitialTableState("spoolList");

  // Fetch data from the API
  const { tableProps, sorters, filters, setSorters, setFilters } =
    useTable<ISpool>({
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

  // Store state in local storage
  useStoreInitialState("spoolList", { sorters, filters });

  // Copy dataSource to avoid mutating the original
  const dataSource = [...(tableProps.dataSource || [])];

  // Add a filament_name field to the dataSource
  dataSource.forEach((element) => {
    if (element.filament.vendor && "name" in element.filament.vendor) {
      element.filament_name = `${element.filament.vendor.name} - ${element.filament.name}`;
    } else {
      element.filament_name = element.filament.name;
    }
  });

  // Filter dataSource by the filters
  const filteredDataSource = dataSource.filter(genericFilterer(filters));

  // Sort dataSource by the sorters
  filteredDataSource.sort(genericSorter(sorters));

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
          sortOrder={getSortOrderForField(sorters, "id")}
        />
        <Table.Column
          dataIndex="filament_name"
          title="Filament"
          sorter={true}
          sortOrder={getSortOrderForField(sorters, "filament_name")}
          filters={filterPopulator(dataSource, "filament_name")}
          filteredValue={getFiltersForField(filters, "filament_name")}
        />
        <Table.Column
          dataIndex="used_weight"
          title="Used Weight"
          sorter={true}
          sortOrder={getSortOrderForField(sorters, "used_weight")}
          render={(value) => {
            return (
              <NumberFieldUnit
                value={value}
                unit="g"
                options={{
                  maximumFractionDigits: 1,
                }}
              />
            );
          }}
        />
        <Table.Column
          dataIndex="remaining_weight"
          title="Estimated Remaining Weight"
          sorter={true}
          sortOrder={getSortOrderForField(sorters, "remaining_weight")}
          render={(value) => {
            if (value === null || value === undefined) {
              return <TextField value="Unknown" />;
            }
            return (
              <NumberFieldUnit
                value={Math.max(value, 0)}
                unit="g"
                options={{
                  maximumFractionDigits: 1,
                }}
              />
            );
          }}
        />
        <Table.Column
          dataIndex="location"
          title="Location"
          sorter={true}
          sortOrder={getSortOrderForField(sorters, "location")}
          filters={filterPopulator(dataSource, "location")}
          filteredValue={getFiltersForField(filters, "location")}
        />
        <Table.Column
          dataIndex="lot_nr"
          title="Lot Nr"
          sorter={true}
          sortOrder={getSortOrderForField(sorters, "lot_nr")}
          filters={filterPopulator(dataSource, "lot_nr")}
          filteredValue={getFiltersForField(filters, "lot_nr")}
        />
        <Table.Column
          dataIndex={["first_used"]}
          title="First Used"
          sorter={true}
          sortOrder={getSortOrderForField(sorters, "first_used")}
          render={(value) => (
            <DateField
              hidden={!value}
              value={dayjs.utc(value).local()}
              title={dayjs.utc(value).local().format()}
              format="YYYY-MM-DD HH:mm:ss"
            />
          )}
        />
        <Table.Column
          dataIndex={["last_used"]}
          title="Last Used"
          sorter={true}
          sortOrder={getSortOrderForField(sorters, "last_used")}
          render={(value) => (
            <DateField
              hidden={!value}
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
          sortOrder={getSortOrderForField(sorters, "comment")}
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
