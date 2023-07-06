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
import { NumberFieldUnit } from "../../components/numberField";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { IFilament } from "./model";
import {
  genericSorter,
  getSortOrderForField,
  typeSorters,
} from "../../utils/sorting";
import {
  genericFilterer,
  getFiltersForField,
  typeFilters,
  useListFiltersForField,
} from "../../utils/filtering";
import { FilterOutlined } from "@ant-design/icons";
import {
  useInitialTableState,
  useStoreInitialState,
} from "../../utils/saveload";

dayjs.extend(utc);

interface IFilamentCollapsed extends IFilament {
  vendor_name: string | null;
}

export const FilamentList: React.FC<IResourceComponentsProps> = () => {
  // Load initial state
  const initialState = useInitialTableState("filamentList");

  // Fetch data from the API
  const { tableProps, sorters, filters, setSorters, setFilters } =
    useTable<IFilament>({
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
  const typedSorters = typeSorters<IFilamentCollapsed>(sorters);
  const typedFilters = typeFilters<IFilamentCollapsed>(filters);

  // Store state in local storage
  useStoreInitialState("filamentList", { sorters, filters });

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
          dataIndex="vendor_name"
          title="Vendor"
          sorter={true}
          sortOrder={getSortOrderForField(typedSorters, "vendor_name")}
          filters={useListFiltersForField(dataSource, "vendor_name")}
          filteredValue={getFiltersForField(typedFilters, "vendor_name")}
        />
        <Table.Column
          dataIndex="name"
          title="Name"
          sorter={true}
          sortOrder={getSortOrderForField(typedSorters, "name")}
          filters={useListFiltersForField(dataSource, "name")}
          filteredValue={getFiltersForField(typedFilters, "name")}
        />
        <Table.Column
          dataIndex="material"
          title="Material"
          sorter={true}
          sortOrder={getSortOrderForField(typedSorters, "material")}
          filters={useListFiltersForField(dataSource, "material")}
          filteredValue={getFiltersForField(typedFilters, "material")}
        />
        <Table.Column
          dataIndex="price"
          title="Price"
          sorter={true}
          sortOrder={getSortOrderForField(typedSorters, "price")}
        />
        <Table.Column
          dataIndex="density"
          title="Density"
          sorter={true}
          sortOrder={getSortOrderForField(typedSorters, "density")}
          render={(value) => (
            <NumberFieldUnit
              value={value}
              unit="g/cm³"
              options={{
                maximumFractionDigits: 2,
              }}
            />
          )}
        />
        <Table.Column
          dataIndex="diameter"
          title="Diameter"
          sorter={true}
          sortOrder={getSortOrderForField(typedSorters, "diameter")}
          render={(value) => (
            <NumberFieldUnit
              value={value}
              unit="mm"
              options={{
                maximumFractionDigits: 2,
              }}
            />
          )}
        />
        <Table.Column
          dataIndex="weight"
          title="Weight"
          sorter={true}
          sortOrder={getSortOrderForField(typedSorters, "weight")}
          render={(value) => {
            if (value === null || value === undefined) {
              return <></>;
            }
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
          dataIndex="spool_weight"
          title="Spool Weight"
          sorter={true}
          sortOrder={getSortOrderForField(typedSorters, "spool_weight")}
          render={(value) => {
            if (value === null || value === undefined) {
              return <></>;
            }
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
          dataIndex="article_number"
          title="Article Number"
          sorter={true}
          sortOrder={getSortOrderForField(typedSorters, "article_number")}
          filters={useListFiltersForField(dataSource, "article_number")}
          filteredValue={getFiltersForField(typedFilters, "article_number")}
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
