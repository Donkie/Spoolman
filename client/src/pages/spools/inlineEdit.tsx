import { EditOutlined } from "@ant-design/icons";
import { useInvalidate, useUpdate } from "@refinedev/core";
import { Input, InputNumber, Select } from "antd";
import type { MessageInstance } from "antd/es/message/interface";
import React, { useCallback, useRef, useState } from "react";
import { formatNumberOnUserInput, numberParserAllowEmpty } from "../../utils/parsing";

type SpoolField = "price" | "used_weight" | "remaining_weight" | "comment" | "location";

interface CommonProps {
  spoolId: number;
  field: SpoolField;
  // Desktop-only affordance. When false, cells render read-only exactly as
  // before (the show/edit pages remain the editing path on touch devices).
  editable: boolean;
  messageApi: MessageInstance;
  t: (key: string) => string;
}

/**
 * Shared mutation helper. Patches ONLY the edited field via Refine's useUpdate
 * on the "spool" resource, then invalidates the list so both interdependent
 * weight columns (used/remaining) refresh with the server-reconciled values.
 */
function useInlineUpdate(spoolId: number, messageApi: MessageInstance, t: (key: string) => string) {
  const invalidate = useInvalidate();
  const { mutate } = useUpdate();
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    (field: SpoolField, value: number | string | null, onDone: (ok: boolean) => void) => {
      setSaving(true);
      mutate(
        {
          resource: "spool",
          id: spoolId,
          values: { [field]: value },
          mutationMode: "pessimistic",
          successNotification: false,
          errorNotification: false,
        },
        {
          onSuccess: () => {
            invalidate({ resource: "spool", invalidates: ["list"] });
            setSaving(false);
            onDone(true);
          },
          onError: () => {
            messageApi.error(t("spool.messages.update_error"));
            setSaving(false);
            onDone(false);
          },
        },
      );
    },
    [mutate, invalidate, spoolId, messageApi, t],
  );

  return { saving, save };
}

/**
 * Read-only display that turns into edit mode on click. Shows a subtle edit
 * icon on hover. Clicks are stopped from bubbling so they don't trigger the
 * row's actions dropdown.
 */
function DisplayShell({
  onEdit,
  align,
  editTitle,
  children,
}: {
  onEdit: () => void;
  align?: "right";
  editTitle: string;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <span
      title={editTitle}
      onClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        minHeight: 22,
        width: align === "right" ? "100%" : undefined,
        justifyContent: align === "right" ? "flex-end" : "flex-start",
      }}
    >
      <span>{children}</span>
      <EditOutlined
        style={{ fontSize: 12, opacity: hover ? 0.65 : 0.15, transition: "opacity 0.15s", flex: "none" }}
      />
    </span>
  );
}

export function EditableNumberCell(
  props: CommonProps & {
    value: number | undefined;
    display: React.ReactNode;
    precision?: number;
    unit?: string;
    addonAfter?: React.ReactNode;
    align?: "right";
  },
) {
  const { spoolId, field, editable, messageApi, t } = props;
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState<number | null>(props.value ?? null);
  const { saving, save } = useInlineUpdate(spoolId, messageApi, t);
  const escaped = useRef(false);

  if (!editable) {
    return <>{props.display}</>;
  }

  if (!editing) {
    return (
      <DisplayShell
        align={props.align}
        editTitle={t("buttons.edit")}
        onEdit={() => {
          setVal(props.value ?? null);
          setEditing(true);
        }}
      >
        {props.display}
      </DisplayShell>
    );
  }

  const commit = () => {
    if (saving) return;
    if (escaped.current) {
      escaped.current = false;
      return;
    }
    const original = props.value ?? null;
    // The weight fields cannot be unset; treat an emptied input as cancel.
    // An emptied price is a real change: it clears the spool's price override
    // so it falls back to the filament price again.
    if (val === null && field !== "price") {
      setEditing(false);
      return;
    }
    if (val === original) {
      setEditing(false);
      return;
    }
    save(field, val, (ok) => {
      if (!ok) setVal(original);
      setEditing(false);
    });
  };

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <InputNumber
        autoFocus
        size="small"
        min={0}
        disabled={saving}
        value={val}
        precision={props.precision}
        addonAfter={props.addonAfter ?? props.unit}
        formatter={formatNumberOnUserInput}
        parser={numberParserAllowEmpty}
        style={{ width: props.addonAfter || props.unit ? 120 : 100 }}
        onChange={(v) => setVal(v as number | null)}
        onPressEnter={commit}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            escaped.current = true;
            setEditing(false);
          }
        }}
      />
    </span>
  );
}

export function EditableTextCell(
  props: CommonProps & {
    value: string | undefined;
    display: React.ReactNode;
    maxLength?: number;
  },
) {
  const { spoolId, field, editable, messageApi, t } = props;
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState<string>(props.value ?? "");
  const { saving, save } = useInlineUpdate(spoolId, messageApi, t);
  const escaped = useRef(false);

  if (!editable) {
    return <>{props.display}</>;
  }

  if (!editing) {
    return (
      <DisplayShell
        editTitle={t("buttons.edit")}
        onEdit={() => {
          setVal(props.value ?? "");
          setEditing(true);
        }}
      >
        {props.display}
      </DisplayShell>
    );
  }

  const commit = () => {
    if (saving) return;
    if (escaped.current) {
      escaped.current = false;
      return;
    }
    const original = props.value ?? "";
    if (val === original) {
      setEditing(false);
      return;
    }
    save(field, val, (ok) => {
      if (!ok) setVal(original);
      setEditing(false);
    });
  };

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Input
        autoFocus
        size="small"
        disabled={saving}
        maxLength={props.maxLength ?? 1024}
        value={val}
        style={{ minWidth: 140 }}
        onChange={(e) => setVal(e.target.value)}
        onPressEnter={commit}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            escaped.current = true;
            setEditing(false);
          }
        }}
      />
    </span>
  );
}

export function EditableLocationCell(
  props: CommonProps & {
    value: string | undefined;
    display: React.ReactNode;
    options: string[];
  },
) {
  const { spoolId, editable, messageApi, t } = props;
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const { saving, save } = useInlineUpdate(spoolId, messageApi, t);

  if (!editable) {
    return <>{props.display}</>;
  }

  if (!editing) {
    return (
      <DisplayShell editTitle={t("buttons.edit")} onEdit={() => setEditing(true)}>
        {props.display}
      </DisplayShell>
    );
  }

  // Mirror the create/edit form: options come from existing locations, and a
  // typed-but-unknown value is offered so new locations can be entered freely.
  // The typed value goes FIRST so that plain Enter commits exactly what was
  // typed instead of a similarly-named existing location.
  const options = [...props.options];
  const trimmed = search.trim();
  if (trimmed && !options.includes(trimmed)) {
    options.unshift(trimmed);
  }

  const commit = (newValue: string | undefined) => {
    if (saving) return;
    const original = props.value ?? "";
    const normalized = newValue ?? "";
    if (original === normalized) {
      setEditing(false);
      return;
    }
    save("location", normalized, () => setEditing(false));
  };

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Select
        autoFocus
        defaultOpen
        showSearch
        allowClear
        size="small"
        loading={saving}
        disabled={saving}
        style={{ minWidth: 130 }}
        defaultValue={props.value || undefined}
        searchValue={search}
        onSearch={setSearch}
        options={options.map((o) => ({ label: o, value: o }))}
        filterOption={(input, option) =>
          String(option?.value ?? "")
            .toLowerCase()
            .includes(input.toLowerCase())
        }
        onSelect={(v) => commit(v as string)}
        onClear={() => commit("")}
        onBlur={() => setEditing(false)}
        onInputKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
      />
    </span>
  );
}
