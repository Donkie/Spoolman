import { Button, Col, Dropdown, Row, Space, Spin } from "antd";
import { ColumnFilterItem, ColumnType } from "antd/es/table/interface";
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
import { Link, useNavigate } from "react-router-dom";

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

interface Entity {
  id: number;
}

export interface Action {
  name: string;
  icon: React.ReactNode;
  link?: string;
  onClick?: () => void;
}

interface BaseColumnProps<Obj extends Entity> {
  id: keyof Obj & string;
  dataId?: keyof Obj & string;
  i18ncat?: string;
  i18nkey?: string;
  dataSource: Obj[];
  tableState: TableState;
  width?: number;
  actions?: (record: Obj) => Action[];
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

function Column<Obj extends Entity>(
  props: BaseColumnProps<Obj> & FilteredColumnProps & CustomColumnProps<Obj>
): ColumnType<Obj> | undefined {
  const t = useTranslate();
  const navigate = useNavigate();

  // Hide if not in showColumns
  if (props.tableState.showColumns && !props.tableState.showColumns.includes(props.id)) {
    return undefined;
  }

  const columnProps: ColumnType<Obj> = {
    dataIndex: props.id,
    title: t(props.i18nkey ?? `${props.i18ncat}.fields.${props.id}`),
    sorter: true,
    sortOrder: getSortOrderForField(typeSorters<Obj>(props.tableState.sorters), props.dataId ?? props.id),
    filterMultiple: props.allowMultipleFilters ?? true,
    width: props.width ?? undefined,
    onCell: props.onCell ?? undefined,
  };

  // Filter
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

  // Render
  const render = props.render ?? ((value) => <>{value}</>);
  columnProps.render = (value, record, index) => {
    if (!props.actions) {
      return render(value, record, index);
    }

    const actions = props.actions(record);

    return (
      <Dropdown
        menu={{
          items: actions.map((action) => ({
            key: action.name,
            label: action.name,
            icon: action.icon,
          })),
          onClick: (item) => {
            const action = actions.find((action) => action.name === item.key);
            if (action) {
              if (action.link) {
                navigate(action.link);
              } else if (action.onClick) {
                action.onClick();
              }
            }
          },
        }}
        trigger={["click"]}
      >
        <div>{render(value, record, index)}</div>
      </Dropdown>
    );
  };

  return columnProps;
}

export function SortedColumn<Obj extends Entity>(props: BaseColumnProps<Obj>) {
  return Column(props);
}

export function RichColumn<Obj extends Entity>(props: BaseColumnProps<Obj>) {
  return Column({
    ...props,
    render: (value: string | undefined) => {
      return enrichText(value);
    },
  });
}

interface FilteredQueryColumnProps<Obj extends Entity> extends BaseColumnProps<Obj> {
  filterValueQuery: UseQueryResult<string[] | ColumnFilterItem[]>;
  allowMultipleFilters?: boolean;
}

export function FilteredQueryColumn<Obj extends Entity>(props: FilteredQueryColumnProps<Obj>) {
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

interface NumberColumnProps<Obj extends Entity> extends BaseColumnProps<Obj> {
  unit: string;
  decimals?: number;
  defaultText?: string;
}

export function NumberColumn<Obj extends Entity>(props: NumberColumnProps<Obj>) {
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

export function DateColumn<Obj extends Entity>(props: BaseColumnProps<Obj>) {
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

export function ActionsColumn<Obj extends Entity>(actionsFn: (record: Obj) => Action[]): ColumnType<Obj> | undefined {
  const t = useTranslate();

  return {
    title: t("table.actions"),
    responsive: ["lg"],
    render: (_, record) => {
      const buttons = actionsFn(record).map((action) => {
        if (action.link) {
          return (
            <Link key={action.name} to={action.link}>
              <Button icon={action.icon} title={action.name} size="small" />
            </Link>
          );
        } else if (action.onClick) {
          return (
            <Button
              key={action.name}
              icon={action.icon}
              title={action.name}
              size="small"
              onClick={() => action.onClick!()}
            />
          );
        }
      });

      return <Space>{buttons}</Space>;
    },
  };
}

interface SpoolIconColumnProps<Obj extends Entity> extends FilteredQueryColumnProps<Obj> {
  color: (record: Obj) => string | undefined;
}

export function SpoolIconColumn<Obj extends Entity>(props: SpoolIconColumnProps<Obj>) {
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
