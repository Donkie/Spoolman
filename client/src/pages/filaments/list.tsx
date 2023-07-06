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
import { NumberFieldUnit } from "../../components/numberField";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { IFilament } from "./model";
import { genericSorter } from "../../utils/sorting";

dayjs.extend(utc);

export const FilamentList: React.FC<IResourceComponentsProps> = () => {
  const { tableProps, sorters } = useTable<IFilament>({
    syncWithLocation: false,
    pagination: {
      mode: "off", // Perform pagination in antd's Table instead. Otherwise client-side sorting/filtering doesn't work.
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
          defaultSortOrder="ascend"
        />
        <Table.Column
          dataIndex={["vendor", "name"]}
          title="Vendor"
          sorter={true}
        />
        <Table.Column dataIndex="name" title="Name" sorter={true} />
        <Table.Column dataIndex="material" title="Material" sorter={true} />
        <Table.Column dataIndex="price" title="Price" sorter={true} />
        <Table.Column
          dataIndex="density"
          title="Density"
          sorter={true}
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
        />
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
