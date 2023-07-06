import React from "react";
import {
  IResourceComponentsProps,
  BaseRecord,
  CrudSort,
  CrudFilter,
} from "@refinedev/core";
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
  filterPopulator,
  genericFilterer,
  genericSorter,
  getFiltersForField,
  getSortOrderForField,
} from "../../utils/sorting";
import { FilterOutlined } from "@ant-design/icons";

dayjs.extend(utc);

export const FilamentList: React.FC<IResourceComponentsProps> = () => {
  // Load sorter state from local storage
  const [sorters_initial] = React.useState<CrudSort[]>(() => {
    const storedSorters = localStorage.getItem("filamentListSorters");
    if (storedSorters) {
      return JSON.parse(storedSorters);
    }
    return [
      {
        field: "id",
        order: "asc",
      },
    ];
  });

  // Load filter state from local storage
  const [filters_initial] = React.useState<CrudFilter[]>(() => {
    const storedFilters = localStorage.getItem("filamentListFilters");
    if (storedFilters) {
      return JSON.parse(storedFilters);
    }
    return [];
  });

  // Fetch data from the API
  const { tableProps, sorters, filters, setSorters, setFilters } =
    useTable<IFilament>({
      syncWithLocation: false,
      pagination: {
        mode: "off", // Perform pagination in antd's Table instead. Otherwise client-side sorting/filtering doesn't work.
      },
      sorters: {
        mode: "off", // Disable server-side sorting
        initial: sorters_initial,
      },
      filters: {
        mode: "off", // Disable server-side filtering
        initial: filters_initial,
      },
    });

  // Store sorter state in local storage
  React.useEffect(() => {
    localStorage.setItem("filamentListSorters", JSON.stringify(sorters));
  }, [sorters]);

  // Store filter state in local storage
  React.useEffect(() => {
    localStorage.setItem("filamentListFilters", JSON.stringify(filters));
  }, [filters]);

  // Copy dataSource to avoid mutating the original
  const dataSource = [...(tableProps.dataSource || [])];

  // Add a vendor_name field to the dataSource
  dataSource.forEach((element) => {
    if (element.vendor) {
      element.vendor_name = element.vendor.name;
    } else {
      element.vendor_name = null;
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
          dataIndex="vendor_name"
          title="Vendor"
          sorter={true}
          sortOrder={getSortOrderForField(sorters, "vendor_name")}
          filters={filterPopulator(dataSource, "vendor_name")}
          filteredValue={getFiltersForField(filters, "vendor_name")}
        />
        <Table.Column
          dataIndex="name"
          title="Name"
          sorter={true}
          sortOrder={getSortOrderForField(sorters, "name")}
          filters={filterPopulator(dataSource, "name")}
          filteredValue={getFiltersForField(filters, "name")}
        />
        <Table.Column
          dataIndex="material"
          title="Material"
          sorter={true}
          sortOrder={getSortOrderForField(sorters, "material")}
          filters={filterPopulator(dataSource, "material")}
          filteredValue={getFiltersForField(filters, "material")}
        />
        <Table.Column
          dataIndex="price"
          title="Price"
          sorter={true}
          sortOrder={getSortOrderForField(sorters, "price")}
        />
        <Table.Column
          dataIndex="density"
          title="Density"
          sorter={true}
          sortOrder={getSortOrderForField(sorters, "density")}
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
          sortOrder={getSortOrderForField(sorters, "diameter")}
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
          sortOrder={getSortOrderForField(sorters, "weight")}
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
          sortOrder={getSortOrderForField(sorters, "spool_weight")}
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
          sortOrder={getSortOrderForField(sorters, "article_number")}
          filters={filterPopulator(dataSource, "article_number")}
          filteredValue={getFiltersForField(filters, "article_number")}
        />
        <Table.Column
          dataIndex={["registered"]}
          title="Registered"
          sorter={true}
          sortOrder={getSortOrderForField(sorters, "registered")}
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
