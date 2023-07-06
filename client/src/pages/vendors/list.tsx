import React from "react";
import {
  IResourceComponentsProps,
  BaseRecord,
  CrudSort,
} from "@refinedev/core";
import {
  useTable,
  List,
  EditButton,
  ShowButton,
  DateField,
  CloneButton,
} from "@refinedev/antd";
import { Table, Space } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { genericSorter } from "../../utils/sorting";
import { SortOrder } from "antd/es/table/interface";

dayjs.extend(utc);

export const VendorList: React.FC<IResourceComponentsProps> = () => {
  // Load sorter state from local storage
  const [sorters_initial] = React.useState<CrudSort[]>(() => {
    const storedSorters = localStorage.getItem("vendorListSorters");
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

  // Fetch data from the API
  const { tableProps, sorters } = useTable({
    syncWithLocation: false,
    pagination: {
      mode: "off", // Perform pagination in antd's Table instead. Otherwise client-side sorting/filtering doesn't work.
    },
    sorters: {
      mode: "off", // Disable server-side sorting
      initial: sorters_initial,
    },
  });

  // Store sorter state in local storage
  React.useEffect(() => {
    localStorage.setItem("vendorListSorters", JSON.stringify(sorters));
  }, [sorters]);

  // Copy dataSource to avoid mutating the original
  const dataSource = [...(tableProps.dataSource || [])];

  // Sort dataSource by the sorters
  dataSource.sort(genericSorter(sorters));

  // Utility function to get the default sort order of a field based on the sorters_initial
  const defaultSortOrder = (field: string): SortOrder | undefined => {
    const sorter = sorters_initial.find((s) => s.field === field);
    if (sorter) {
      return sorter.order === "asc" ? "ascend" : "descend";
    }
    return undefined;
  };

  return (
    <List>
      <Table
        {...tableProps}
        dataSource={dataSource}
        pagination={{ showSizeChanger: true, pageSize: 20 }}
        rowKey="id"
      >
        <Table.Column
          dataIndex="id"
          title="Id"
          sorter={true}
          defaultSortOrder={defaultSortOrder("id")}
        />
        <Table.Column
          dataIndex="name"
          title="Name"
          sorter={true}
          defaultSortOrder={defaultSortOrder("name")}
        />
        <Table.Column
          dataIndex={["registered"]}
          title="Registered"
          sorter={true}
          defaultSortOrder={defaultSortOrder("registered")}
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
          defaultSortOrder={defaultSortOrder("comment")}
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
