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
  TextField,
  CloneButton,
} from "@refinedev/antd";
import { Table, Space } from "antd";
import { NumberFieldUnit } from "../../components/numberField";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { genericSorter } from "../../utils/sorting";
import { SortOrder } from "antd/es/table/interface";
import { ISpool } from "./model";

dayjs.extend(utc);

export const SpoolList: React.FC<IResourceComponentsProps> = () => {
  // Load sorter state from local storage
  const [sorters_initial] = React.useState<CrudSort[]>(() => {
    const storedSorters = localStorage.getItem("spoolListSorters");
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
  const { tableProps, sorters } = useTable<ISpool>({
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
    localStorage.setItem("spoolListSorters", JSON.stringify(sorters));
  }, [sorters]);

  // Copy dataSource to avoid mutating the original
  const dataSource = [...(tableProps.dataSource || [])];

  // Sort dataSource by the sorters
  dataSource.sort(genericSorter(sorters));

  // Add a filament_name field to the dataSource
  dataSource.forEach((element) => {
    if (element.filament.vendor && "name" in element.filament.vendor) {
      element.filament_name = `${element.filament.vendor.name} - ${element.filament.name}`;
    } else {
      element.filament_name = element.filament.name;
    }
  });

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
          dataIndex="filament_name"
          title="Filament"
          sorter={true}
          defaultSortOrder={defaultSortOrder("filament_name")}
        />
        <Table.Column
          dataIndex="used_weight"
          title="Used Weight"
          sorter={true}
          defaultSortOrder={defaultSortOrder("used_weight")}
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
          defaultSortOrder={defaultSortOrder("remaining_weight")}
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
          defaultSortOrder={defaultSortOrder("location")}
        />
        <Table.Column
          dataIndex="lot_nr"
          title="Lot Nr"
          sorter={true}
          defaultSortOrder={defaultSortOrder("lot_nr")}
        />
        <Table.Column
          dataIndex={["first_used"]}
          title="First Used"
          sorter={true}
          defaultSortOrder={defaultSortOrder("first_used")}
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
          defaultSortOrder={defaultSortOrder("last_used")}
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
