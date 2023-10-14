import { Col, Row, Spin, Table } from "antd";
import { ColumnProps as AntdColumnProps } from "antd/es/table";
import { ColumnFilterItem } from "antd/es/table/interface";
import { getFiltersForField, typeFilters } from "../utils/filtering";
import { TableState } from "../utils/saveload";
import { getSortOrderForField, typeSorters } from "../utils/sorting";
import { NumberFieldUnit } from "./numberField";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { DateField, TextField } from "@refinedev/antd";
import Icon from "@ant-design/icons";
import SpoolIcon from "../icon_spool.svg?react";
import { useTranslate } from "@refinedev/core";
import { enrichText } from "../utils/parsing";
import { UseQueryResult } from "@tanstack/react-query";

dayjs.extend(utc);

const FilterDropdownLoading = () => {
  return (
    <Row justify="center">
      <Col>
        Loading...
        <Spin style={{ margin: 10 }} />
      </Col>
    </Row>
  );
};

interface BaseColumnProps<Obj> {
  id: keyof Obj & string;
  dataId?: keyof Obj & string;
  i18ncat?: string;
  i18nkey?: string;
  dataSource: Obj[];
  tableState: TableState;
  width?: number;
}

interface FilteredColumnProps {
  filters?: ColumnFilterItem[];
  filteredValue?: string[];
  allowMultipleFilters?: boolean;
  onFilterDropdownOpen?: () => void;
  loadingFilters?: boolean;
}

interface CustomColumnProps<Obj> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render?: (value: any, record: Obj, index: number) => React.ReactNode;
  onCell?: (
    data: Obj,
    index?: number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => React.HTMLAttributes<any> | React.TdHTMLAttributes<any>;
}

function Column<Obj>(props: BaseColumnProps<Obj> & FilteredColumnProps & CustomColumnProps<Obj>) {
  const t = useTranslate();
  if (props.tableState.showColumns && !props.tableState.showColumns.includes(props.id)) {
    return <></>;
  }
  const typedSorters = typeSorters<Obj>(props.tableState.sorters);
  const columnProps: AntdColumnProps<Obj> = {
    dataIndex: props.id,
    title: t(props.i18nkey ?? `${props.i18ncat}.fields.${props.id}`),
    sorter: true,
    sortOrder: getSortOrderForField(typedSorters, props.dataId ?? props.id),
    filterMultiple: props.allowMultipleFilters ?? true,
  };
  if (props.width) {
    columnProps.width = props.width;
  }
  if (props.filters && props.filteredValue) {
    columnProps.filters = props.filters;
    columnProps.filteredValue = props.filteredValue;
    if (props.loadingFilters) {
      columnProps.filterDropdown = <FilterDropdownLoading />;
    }
    columnProps.onFilterDropdownOpenChange = (open) => {
      if (open && props.onFilterDropdownOpen) {
        props.onFilterDropdownOpen();
      }
    };
    if (props.dataId) {
      columnProps.key = props.dataId;
    }
  }
  if (props.render) {
    columnProps.render = props.render;
  }
  if (props.onCell) {
    columnProps.onCell = props.onCell;
  }
  return <Table.Column<Obj> {...columnProps} />;
}

export function SortedColumn<Obj>(props: BaseColumnProps<Obj>) {
  return Column(props);
}

export function RichColumn<Obj>(props: BaseColumnProps<Obj>) {
  return Column({
    ...props,
    render: (value: string | undefined) => {
      return enrichText(value);
    },
  });
}

interface FilteredQueryColumnProps<Obj> extends BaseColumnProps<Obj> {
  filterValueQuery: UseQueryResult<string[] | ColumnFilterItem[]>;
  allowMultipleFilters?: boolean;
}

export function FilteredQueryColumn<Obj>(props: FilteredQueryColumnProps<Obj>) {
  const query = props.filterValueQuery;

  let filters: ColumnFilterItem[] = [];
  if (query.data) {
    filters = query.data.map((item) => {
      if (typeof item === "string") {
        return {
          text: item,
          value: item,
        };
      }
      return item;
    });
  }
  filters.push({
    text: "<empty>",
    value: "<empty>",
  });

  const typedFilters = typeFilters<Obj>(props.tableState.filters);
  const filteredValue = getFiltersForField(typedFilters, props.dataId ?? props.id);

  const onFilterDropdownOpen = () => {
    query.refetch();
  };

  return Column({ ...props, filters, filteredValue, onFilterDropdownOpen, loadingFilters: query.isLoading });
}

interface NumberColumnProps<Obj> extends BaseColumnProps<Obj> {
  unit: string;
  decimals?: number;
  defaultText?: string;
}

export function NumberColumn<Obj>(props: NumberColumnProps<Obj>) {
  return Column({
    ...props,
    render: (value) => {
      if (value === null || value === undefined) {
        return <TextField value={props.defaultText ?? ""} />;
      }
      return (
        <NumberFieldUnit
          value={value}
          unit={props.unit}
          options={{
            maximumFractionDigits: props.decimals ?? 0,
            minimumFractionDigits: props.decimals ?? 0,
          }}
        />
      );
    },
  });
}

export function DateColumn<Obj>(props: BaseColumnProps<Obj>) {
  return Column({
    ...props,
    render: (value) => {
      return (
        <DateField
          hidden={!value}
          value={dayjs.utc(value).local()}
          title={dayjs.utc(value).local().format()}
          format="YYYY-MM-DD HH:mm:ss"
        />
      );
    },
  });
}

interface SpoolIconColumnProps<Obj> extends FilteredQueryColumnProps<Obj> {
  color: (record: Obj) => string | undefined;
}

export function SpoolIconColumn<Obj>(props: SpoolIconColumnProps<Obj>) {
  const query = props.filterValueQuery;

  let filters: ColumnFilterItem[] = [];
  if (query.data) {
    filters = query.data.map((item) => {
      if (typeof item === "string") {
        return {
          text: item,
          value: item,
        };
      }
      return item;
    });
  }
  filters.push({
    text: "<empty>",
    value: "",
  });

  const typedFilters = typeFilters<Obj>(props.tableState.filters);
  const filteredValue = getFiltersForField(typedFilters, props.dataId ?? props.id);

  const onFilterDropdownOpen = () => {
    query.refetch();
  };

  return Column({
    ...props,
    filters,
    filteredValue,
    onFilterDropdownOpen,
    loadingFilters: query.isLoading,
    onCell: () => {
      return {
        style: {
          paddingLeft: 0,
          paddingTop: 0,
          paddingBottom: 0,
        },
      };
    },
    render: (value, record: Obj) => {
      const colorStr = props.color(record);
      return (
        <Row wrap={false} justify="space-around" align="middle">
          {colorStr && (
            <Col flex="none">
              <Icon
                component={SpoolIcon}
                style={{
                  color: "#" + colorStr,
                  fontSize: 42,
                  marginRight: 0,
                }}
              />
            </Col>
          )}
          <Col flex="auto">{value}</Col>
        </Row>
      );
    },
  });
}
