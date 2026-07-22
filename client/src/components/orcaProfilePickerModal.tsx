import { useTranslate } from "@refinedev/core";
import { Alert, Form, Modal, Select } from "antd";
import { searchMatches } from "../utils/filtering";
import { Field, FieldType } from "../utils/queryFields";
import { OrcaFilamentProfileSummary, useOrcaConnectionStatus, useOrcaFilamentProfiles } from "../utils/queryOrca";

// Mirrors spoolman/orca_cloud.py's _first_str/_first_float/_first_int/encode_profile_value —
// OrcaSlicer profile values are typically single-element arrays (its per-layer-override format).
function firstStr(val: unknown): string | null {
  if (Array.isArray(val)) return val.length > 0 ? String(val[0]) : null;
  if (typeof val === "string") return val || null;
  return null;
}

function firstFloat(val: unknown): number | null {
  const s = firstStr(val);
  if (s === null) return null;
  const f = Number.parseFloat(s);
  return Number.isNaN(f) ? null : f;
}

function firstInt(val: unknown): number | null {
  const f = firstFloat(val);
  return f === null ? null : Math.trunc(f);
}

function encodeProfileValue(rawValue: unknown, fieldType: FieldType): unknown {
  if (fieldType === FieldType.float || fieldType === FieldType.float_range) {
    return firstFloat(rawValue);
  }
  if (fieldType === FieldType.integer || fieldType === FieldType.integer_range) {
    return firstInt(rawValue);
  }
  if (fieldType === FieldType.boolean) {
    const s = firstStr(rawValue);
    return s === null ? null : !(s === "0" || s === "false" || s === "");
  }
  // text / choice / datetime (same catch-all as the backend)
  return firstStr(rawValue);
}

/**
 * Extra-field values to apply from a picked OrcaCloud profile: orca_filament_id/orca_setting_id
 * always come from the profile itself, and any other defined extra field is filled in only if
 * its key matches a key in the profile's raw content (same matching /orca/import does), so
 * picking a profile never invents data for fields that don't correspond to anything in Orca.
 */
export function getOrcaProfileExtraValues(
  profile: OrcaFilamentProfileSummary,
  definedExtraFields: readonly Field[],
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of definedExtraFields) {
    if (field.key === "orca_filament_id") {
      if (profile.filament_id) {
        values[field.key] = profile.filament_id;
      }
    } else if (field.key === "orca_setting_id") {
      if (profile.setting_id) {
        values[field.key] = profile.setting_id;
      }
    } else {
      const rawVal = profile.content[field.key];
      if (rawVal === undefined || rawVal === null) continue;
      const encoded = encodeProfileValue(rawVal, field.field_type);
      if (encoded !== null) {
        values[field.key] = encoded;
      }
    }
  }
  return values;
}

export function OrcaProfilePickerModal(props: {
  isOpen: boolean;
  onSelect: (profile: OrcaFilamentProfileSummary) => void;
  onClose: () => void;
}) {
  const [form] = Form.useForm();
  const t = useTranslate();

  const connectionStatus = useOrcaConnectionStatus();
  const profiles = useOrcaFilamentProfiles(props.isOpen && connectionStatus.data?.connected === true);

  const profileOptions =
    profiles.data?.map((item) => {
      return {
        label: [item.vendor, item.material, item.name].filter(Boolean).join(" - "),
        value: item.orca_id,
        item: item,
      };
    }) ?? [];
  profileOptions.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

  const notConnected = connectionStatus.data?.connected === false;

  return (
    <Modal
      title={t("filament.form.link_orca_profile")}
      open={props.isOpen}
      onOk={() => form.submit()}
      onCancel={() => props.onClose()}
      okButtonProps={{ disabled: notConnected }}
      confirmLoading={profiles.isFetching}
    >
      <Form
        layout="vertical"
        form={form}
        onFinish={(values) => {
          const profile = profileOptions.find((item) => item.value === values.profile)?.item;
          if (!profile) {
            throw new Error("Profile not found");
          }
          props.onSelect(profile);
          props.onClose();
          form.resetFields();
        }}
      >
        <p>{t("filament.form.link_orca_profile_description")}</p>
        {notConnected && (
          <Alert
            type="warning"
            showIcon
            message={t("filament.form.link_orca_profile_not_connected")}
            style={{ marginBottom: 16 }}
          />
        )}
        {profiles.isError && (
          <Alert
            type="error"
            showIcon
            message={profiles.error instanceof Error ? profiles.error.message : String(profiles.error)}
            style={{ marginBottom: 16 }}
          />
        )}
        <Form.Item name="profile" rules={[{ required: true }]}>
          <Select
            options={profileOptions}
            showSearch
            loading={profiles.isFetching}
            disabled={notConnected}
            filterOption={(input, option) => typeof option?.label === "string" && searchMatches(input, option?.label)}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
