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
import { Table, Space } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { genericSorter } from "../../utils/sorting";

dayjs.extend(utc);

export const VendorList: React.FC<IResourceComponentsProps> = () => {
  const { tableProps, sorters } = useTable({
    syncWithLocation: true,
    pagination: {
      mode: "client",
      pageSize: 20,
    },
    sorters: {
      mode: "off", // Disable server-side sorting
      initial: [
        {
          field: "id",
          order: "asc",
        },
      ],
    },
  });

  // Copy dataSource to avoid mutating the original
  const dataSource = [...(tableProps.dataSource || [])];

  // Sort dataSource by the sorters
  dataSource.sort(genericSorter(sorters));

  return (
    <List>
      <Table {...tableProps} dataSource={dataSource} rowKey="id">
        <Table.Column
          dataIndex="id"
          title="Id"
          sorter={true}
          defaultSortOrder="ascend"
        />
        <Table.Column dataIndex="name" title="Name" sorter={true} />
        <Table.Column
          dataIndex={["registered"]}
          title="Registered"
          sorter={true}
          render={(value) => (
            <DateField
              value={dayjs.utc(value).local()}
              title={dayjs.utc(value).local().format()}
              format="YYYY-MM-DD HH:mm:ss"
            />
          )}
        />
        <Table.Column dataIndex={["comment"]} title="Comment" sorter={true} />
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
