import { SearchOutlined } from "@ant-design/icons";
import { Input } from "antd";

interface ResourceSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function ResourceSearchInput({ value, onChange, placeholder }: ResourceSearchInputProps) {
  return (
    <Input
      allowClear
      className="resource-search-input"
      prefix={<SearchOutlined />}
      value={value}
      placeholder={placeholder ?? "Search"}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
