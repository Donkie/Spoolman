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
import { ISpool } from "./model";
import {
  useInitialTableState,
  useStoreInitialState,
} from "../../utils/saveload";
import { FilterOutlined } from "@ant-design/icons";

dayjs.extend(utc);

interface ISpoolCollapsed extends ISpool {
  filament_name: string;
}

export const SpoolList: React.FC<IResourceComponentsProps> = () => {
  // Load initial state
  const initialState = useInitialTableState("spoolList");

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
  } = useTable<ISpool>({
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

  // Type the sorters and filters
  const typedSorters = typeSorters<ISpoolCollapsed>(sorters);
  const typedFilters = typeFilters<ISpoolCollapsed>(filters);

  // Store state in local storage
  useStoreInitialState("spoolList", {
    sorters,
    filters,
    pagination: { current, pageSize },
  });

  // Collapse the dataSource to a mutable list and add a filament_name field
  const dataSource: ISpoolCollapsed[] = React.useMemo(
    () =>
      (tableProps.dataSource ?? []).map((element) => {
        let filament_name: string;
        if (element.filament.vendor && "name" in element.filament.vendor) {
          filament_name = `${element.filament.vendor.name} - ${element.filament.name}`;
        } else {
          filament_name =
            element.filament.name ?? element.filament.id.toString();
        }
        return { ...element, filament_name };
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
        <Table.Column
          dataIndex="id"
          title="Id"
          sorter={true}
          sortOrder={getSortOrderForField(typedSorters, "id")}
        />
        <Table.Column
          dataIndex="filament_name"
          title="Filament"
          sorter={true}
          sortOrder={getSortOrderForField(typedSorters, "filament_name")}
          filters={useListFiltersForField(dataSource, "filament_name")}
          filteredValue={getFiltersForField(typedFilters, "filament_name")}
        />
        <Table.Column
          dataIndex="used_weight"
          title="Used Weight"
          sorter={true}
          sortOrder={getSortOrderForField(typedSorters, "used_weight")}
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
          sortOrder={getSortOrderForField(typedSorters, "remaining_weight")}
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
          sortOrder={getSortOrderForField(typedSorters, "location")}
          filters={useListFiltersForField(dataSource, "location")}
          filteredValue={getFiltersForField(typedFilters, "location")}
        />
        <Table.Column
          dataIndex="lot_nr"
          title="Lot Nr"
          sorter={true}
          sortOrder={getSortOrderForField(typedSorters, "lot_nr")}
          filters={useListFiltersForField(dataSource, "lot_nr")}
          filteredValue={getFiltersForField(typedFilters, "lot_nr")}
        />
        <Table.Column
          dataIndex={["first_used"]}
          title="First Used"
          sorter={true}
          sortOrder={getSortOrderForField(typedSorters, "first_used")}
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
          sortOrder={getSortOrderForField(typedSorters, "last_used")}
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
