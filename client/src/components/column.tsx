import { DateField, TextField } from "@refinedev/antd";
import { UseQueryResult } from "@tanstack/react-query";
import { Button, Col, DatePicker, Dropdown, Input, InputNumber, Row, Space, Spin } from "antd";
import { ColumnFilterItem, ColumnType, FilterDropdownProps } from "antd/es/table/interface";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { AlignType } from "rc-table/lib/interface";
import { Link } from "react-router";
import { getFiltersForField, typeFilters } from "../utils/filtering";
import { enrichText } from "../utils/parsing";
import { Field, FieldType } from "../utils/queryFields";
import { TableState } from "../utils/saveload";
import { getSortOrderForField, typeSorters } from "../utils/sorting";
import { NumberFieldUnit, NumberFieldUnitRange } from "./numberField";
import SpoolIcon from "./spoolIcon";

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

function TextFilterDropdown({ setSelectedKeys, selectedKeys, confirm, clearFilters }: FilterDropdownProps) {
  const hasValue = selectedKeys.length > 0;
  return (
    <>
      <div style={{ padding: "8px" }}>
        <Input
          placeholder="Search..."
          value={selectedKeys[0] as string}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => confirm()}
        />
      </div>
      <div className="ant-table-filter-dropdown-btns">
        <Button type="link" size="small" disabled={!hasValue} onClick={() => { clearFilters?.(); confirm(); }}>
          Reset
        </Button>
        <Button type="primary" size="small" onClick={() => confirm()}>
          OK
        </Button>
      </div>
    </>
  );
}

function NumberRangeFilterDropdown({
  setSelectedKeys,
  selectedKeys,
  confirm,
  clearFilters,
  precision,
}: FilterDropdownProps & { precision?: number }) {
  const current = selectedKeys[0] as string | undefined;
  let minVal: number | null = null;
  let maxVal: number | null = null;
  if (current && current.includes(":")) {
    const parts = current.split(":", 2);
    minVal = parts[0] ? Number(parts[0]) : null;
    maxVal = parts[1] ? Number(parts[1]) : null;
  }

  const updateKeys = (min: number | null, max: number | null) => {
    if (min === null && max === null) {
      setSelectedKeys([]);
    } else {
      setSelectedKeys([`${min !== null ? min : ""}:${max !== null ? max : ""}`]);
    }
  };

  const hasValue = selectedKeys.length > 0;
  return (
    <>
      <div style={{ padding: "8px", display: "flex", flexDirection: "column", gap: 4 }}>
        <InputNumber
          placeholder="Min..."
          value={minVal}
          precision={precision ?? 0}
          onChange={(value) => updateKeys(value, maxVal)}
        />
        <InputNumber
          placeholder="Max..."
          value={maxVal}
          precision={precision ?? 0}
          onChange={(value) => updateKeys(minVal, value)}
        />
      </div>
      <div className="ant-table-filter-dropdown-btns">
        <Button type="link" size="small" disabled={!hasValue} onClick={() => { clearFilters?.(); confirm(); }}>
          Reset
        </Button>
        <Button type="primary" size="small" onClick={() => confirm()}>
          OK
        </Button>
      </div>
    </>
  );
}

function DateTimeRangeFilterDropdown({ setSelectedKeys, selectedKeys, confirm, clearFilters }: FilterDropdownProps) {
  const current = selectedKeys[0] as string | undefined;
  let fromVal: dayjs.Dayjs | null = null;
  let toVal: dayjs.Dayjs | null = null;
  if (current && current.includes("|")) {
    const parts = current.split("|", 2);
    fromVal = parts[0] ? dayjs(parts[0]) : null;
    toVal = parts[1] ? dayjs(parts[1]) : null;
  }

  const updateKeys = (from: dayjs.Dayjs | null, to: dayjs.Dayjs | null) => {
    if (from === null && to === null) {
      setSelectedKeys([]);
    } else {
      setSelectedKeys([`${from ? from.utc().toISOString() : ""}|${to ? to.utc().toISOString() : ""}`]);
    }
  };

  const hasValue = selectedKeys.length > 0;
  return (
    <>
      <div style={{ padding: "8px", display: "flex", flexDirection: "column", gap: 4 }}>
        <DatePicker
          showTime={{ use12Hours: false }}
          format="YYYY-MM-DD HH:mm:ss"
          placeholder="From..."
          value={fromVal}
          onChange={(date) => updateKeys(date, toVal)}
        />
        <DatePicker
          showTime={{ use12Hours: false }}
          format="YYYY-MM-DD HH:mm:ss"
          placeholder="To..."
          value={toVal}
          onChange={(date) => updateKeys(fromVal, date)}
        />
      </div>
      <div className="ant-table-filter-dropdown-btns">
        <Button type="link" size="small" disabled={!hasValue} onClick={() => { clearFilters?.(); confirm(); }}>
          Reset
        </Button>
        <Button type="primary" size="small" onClick={() => confirm()}>
          OK
        </Button>
      </div>
    </>
  );
}

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
  id: string | string[];
  dataId?: (keyof Obj & string) | string; // Allow string values for custom fields
  i18ncat?: string;
  i18nkey?: string;
  title?: string;
  align?: AlignType;
  sorter?: boolean;
  t: (key: string) => string;
  navigate: (link: string) => void;
  dataSource: Obj[];
  tableState: TableState;
  width?: number;
  actions?: (record: Obj) => Action[];
  transform?: (value: unknown) => unknown;
  render?: (rawValue: string | undefined, record: Obj) => React.ReactNode;
}

interface FilteredColumnProps {
  filters?: ColumnFilterItem[];
  filteredValue?: string[];
  allowMultipleFilters?: boolean;
  onFilterDropdownOpen?: () => void;
  loadingFilters?: boolean;
  filterDropdown?: (props: FilterDropdownProps) => React.ReactNode;
}

interface CustomColumnProps<Obj> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render?: (value: any, record: Obj, index: number) => React.ReactNode;
  onCell?: (
    data: Obj,
    index?: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => React.HTMLAttributes<any> | React.TdHTMLAttributes<any>;
}

function Column<Obj extends Entity>(
  props: BaseColumnProps<Obj> & FilteredColumnProps & CustomColumnProps<Obj>,
): ColumnType<Obj> | undefined {
  const t = props.t;
  const navigate = props.navigate;

  // Hide if not in showColumns
  const id = Array.isArray(props.id) ? props.id.join(".") : props.id;
  if (props.tableState.showColumns && !props.tableState.showColumns.includes(id)) {
    return undefined;
  }

  const columnProps: ColumnType<Obj> = {
    dataIndex: props.id,
    align: props.align,
    title: props.title ?? t(props.i18nkey ?? `${props.i18ncat}.fields.${props.id}`),
    filterMultiple: props.allowMultipleFilters ?? true,
    width: props.width ?? undefined,
    onCell: props.onCell ?? undefined,
  };

  // Sorting
  if (props.sorter) {
    columnProps.sorter = true;
    const sortField = props.dataId ?? (Array.isArray(props.id) ? props.id.join(".") : props.id);
    columnProps.sortOrder = getSortOrderForField(typeSorters<Obj>(props.tableState.sorters), sortField);
  }

  // Filter
  if (props.filters && props.filteredValue) {
    columnProps.filters = props.filters;
    columnProps.filteredValue = props.filteredValue;
    if (props.loadingFilters) {
      columnProps.filterDropdown = <FilterDropdownLoading />;
    }
    columnProps.filterDropdownProps = {
      onOpenChange: (open) => {
        if (open && props.onFilterDropdownOpen) {
          props.onFilterDropdownOpen();
        }
      },
    };
    if (props.dataId) {
      columnProps.key = props.dataId;
    }
  } else if (props.filterDropdown) {
    columnProps.filterDropdown = props.filterDropdown;
    columnProps.filteredValue = props.filteredValue;
    columnProps.filterMultiple = false;
    if (props.dataId) {
      columnProps.key = props.dataId;
    }
  }

  // Render
  const render =
    props.render ??
    ((rawValue) => {
      const value = props.transform ? props.transform(rawValue) : rawValue;
      return <>{value}</>;
    });
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
  return Column({
    ...props,
    sorter: true,
  });
}

export function RichColumn<Obj extends Entity>(
  props: Omit<BaseColumnProps<Obj>, "transform"> & FilteredColumnProps & { transform?: (value: unknown) => string },
) {
  return Column({
    ...props,
    render: (rawValue: string | undefined) => {
      const value = props.transform ? props.transform(rawValue) : rawValue;
      return enrichText(value);
    },
  });
}

interface FilteredQueryColumnProps<Obj extends Entity> extends BaseColumnProps<Obj> {
  filterValueQuery: UseQueryResult<string[] | ColumnFilterItem[], unknown>;
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
          value: '"' + item + '"',
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
  const filterField = props.dataId ?? (Array.isArray(props.id) ? props.id.join(".") : props.id);
  const filteredValue = getFiltersForField(typedFilters, filterField);

  const onFilterDropdownOpen = () => {
    query.refetch();
  };

  return Column({ ...props, filters, filteredValue, onFilterDropdownOpen, loadingFilters: query.isLoading });
}

interface NumberColumnProps<Obj extends Entity> extends BaseColumnProps<Obj>, FilteredColumnProps {
  unit: string;
  maxDecimals?: number;
  minDecimals?: number;
  defaultText?: string;
}

export function NumberColumn<Obj extends Entity>(props: NumberColumnProps<Obj>) {
  return Column({
    ...props,
    align: "right",
    render: (rawValue) => {
      const value = props.transform ? props.transform(rawValue) : rawValue;
      if (value === null || value === undefined) {
        return <TextField value={props.defaultText ?? ""} />;
      }
      return (
        <NumberFieldUnit
          value={value}
          unit={props.unit}
          options={{
            maximumFractionDigits: props.maxDecimals ?? 0,
            minimumFractionDigits: props.minDecimals ?? props.maxDecimals ?? 0,
          }}
        />
      );
    },
  });
}

export function DateColumn<Obj extends Entity>(props: BaseColumnProps<Obj> & FilteredColumnProps) {
  return Column({
    ...props,
    render: (rawValue) => {
      const value = props.transform ? props.transform(rawValue) : rawValue;
      return (
        <DateField
          hidden={!value}
          value={dayjs.utc(value).local()}
          title={dayjs.utc(value).local().format()}
          format="YYYY-MM-DD HH:mm"
        />
      );
    },
  });
}

export function ActionsColumn<Obj extends Entity>(
  title: string,
  actionsFn: (record: Obj) => Action[],
): ColumnType<Obj> | undefined {
  return {
    title,
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
  color: (record: Obj) => string | { colors: string[]; vertical: boolean } | undefined;
}

export function SpoolIconColumn<Obj extends Entity>(props: SpoolIconColumnProps<Obj>) {
  const query = props.filterValueQuery;

  let filters: ColumnFilterItem[] = [];
  if (query.data) {
    filters = query.data.map((item) => {
      if (typeof item === "string") {
        return {
          text: item,
          value: '"' + item + '"',
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
  const filterField = props.dataId ?? (Array.isArray(props.id) ? props.id.join(".") : props.id);
  const filteredValue = getFiltersForField(typedFilters, filterField);

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
    render: (rawValue, record: Obj) => {
      const value = props.transform ? props.transform(rawValue) : rawValue;
      const colorObj = props.color(record);
      return (
        <Row wrap={false} justify="space-around" align="middle">
          {colorObj && (
            <Col flex="none">
              <SpoolIcon color={colorObj} />
            </Col>
          )}
          <Col flex="auto">{value}</Col>
        </Row>
      );
    },
  });
}

export function NumberRangeColumn<Obj extends Entity>(props: NumberColumnProps<Obj>) {
  return Column({
    ...props,
    render: (rawValue) => {
      const value = props.transform ? props.transform(rawValue) : rawValue;
      if (value === null || value === undefined) {
        return <TextField value={props.defaultText ?? ""} />;
      }
      if (!Array.isArray(value) || value.length !== 2) {
        return <TextField value={props.defaultText ?? ""} />;
      }

      return (
        <NumberFieldUnitRange
          value={value}
          unit={props.unit}
          options={{
            maximumFractionDigits: props.maxDecimals ?? 0,
            minimumFractionDigits: props.minDecimals ?? props.maxDecimals ?? 0,
          }}
        />
      );
    },
  });
}

// Helper function to create filter items for custom fields (boolean and choice only)
function createCustomFieldFilters(field: Field): ColumnFilterItem[] {
  const filters: ColumnFilterItem[] = [];

  if (field.field_type === FieldType.boolean) {
    // "No" maps to empty ("") because the backend treats unset and false as equivalent
    return [
      { text: "Yes", value: "true" },
      { text: "No / Not set", value: "" },
    ];
  }

  // For choice fields, add each choice as a filter option
  if (field.field_type === FieldType.choice && field.choices) {
    field.choices.forEach((choice) => {
      filters.push({
        text: choice,
        value: `"${choice}"`,
      });
    });
  }

  filters.push({ text: "<empty>", value: "" });

  return filters;
}

export function CustomFieldColumn<Obj extends Entity>(props: Omit<BaseColumnProps<Obj>, "id"> & { field: Field }) {
  const field = props.field;
  const fieldId = `extra.${field.key}`;

  const typedFilters = typeFilters<Obj>(props.tableState.filters);
  const filteredValue = getFiltersForField(typedFilters, fieldId);

  const commonProps = {
    ...props,
    id: ["extra", field.key],
    title: field.name,
    sorter: true,
    dataId: fieldId,
    transform: (value: unknown) => {
      if (value === null || value === undefined) {
        return undefined;
      }
      return JSON.parse(value as string);
    },
  };

  if (field.field_type === FieldType.integer) {
    return NumberColumn({
      ...commonProps,
      filterDropdown: (p: FilterDropdownProps) => <NumberRangeFilterDropdown {...p} precision={0} />,
      filteredValue,
      unit: field.unit ?? "",
      maxDecimals: 0,
    });
  } else if (field.field_type === FieldType.float) {
    return NumberColumn({
      ...commonProps,
      filterDropdown: (p: FilterDropdownProps) => <NumberRangeFilterDropdown {...p} precision={3} />,
      filteredValue,
      unit: field.unit ?? "",
      minDecimals: 0,
      maxDecimals: 3,
    });
  } else if (field.field_type === FieldType.integer_range) {
    return NumberRangeColumn({
      ...commonProps,
      filterDropdown: (p: FilterDropdownProps) => <NumberRangeFilterDropdown {...p} precision={0} />,
      filteredValue,
      unit: field.unit ?? "",
      maxDecimals: 0,
    });
  } else if (field.field_type === FieldType.float_range) {
    return NumberRangeColumn({
      ...commonProps,
      filterDropdown: (p: FilterDropdownProps) => <NumberRangeFilterDropdown {...p} precision={3} />,
      filteredValue,
      unit: field.unit ?? "",
      minDecimals: 0,
      maxDecimals: 3,
    });
  } else if (field.field_type === FieldType.text) {
    return RichColumn({
      ...commonProps,
      filterDropdown: TextFilterDropdown,
      filteredValue,
    });
  } else if (field.field_type === FieldType.datetime) {
    return DateColumn({
      ...commonProps,
      filterDropdown: DateTimeRangeFilterDropdown,
      filteredValue,
    });
  } else if (field.field_type === FieldType.boolean) {
    return Column({
      ...commonProps,
      filters: createCustomFieldFilters(field),
      filteredValue,
      render: (rawValue) => {
        const value = commonProps.transform ? commonProps.transform(rawValue) : rawValue;
        let text;
        if (value === undefined || value === null) {
          text = "";
        } else if (value) {
          text = props.t("yes");
        } else {
          text = props.t("no");
        }
        return <TextField value={text} />;
      },
    });
  } else if (field.field_type === FieldType.choice && !field.multi_choice) {
    return Column({
      ...commonProps,
      filters: createCustomFieldFilters(field),
      filteredValue,
      render: (rawValue) => {
        const value = commonProps.transform ? commonProps.transform(rawValue) : rawValue;
        return <TextField value={value} />;
      },
    });
  } else if (field.field_type === FieldType.choice && field.multi_choice) {
    return Column({
      ...commonProps,
      filters: createCustomFieldFilters(field),
      filteredValue,
      render: (rawValue) => {
        const value = commonProps.transform ? commonProps.transform(rawValue) : rawValue;
        return <TextField value={(value as string[] | undefined)?.join(", ")} />;
      },
    });
  } else {
    return Column({
      ...commonProps,
      render: (rawValue) => {
        const value = commonProps.transform ? commonProps.transform(rawValue) : rawValue;
        return <TextField value={value} />;
      },
    });
  }
}
