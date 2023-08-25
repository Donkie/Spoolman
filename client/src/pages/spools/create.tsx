import React, {useState} from "react";
import {IResourceComponentsProps, useTranslate} from "@refinedev/core";
import {Create, useForm, useSelect} from "@refinedev/antd";
import {Form, Input, DatePicker, Select, InputNumber} from "antd";
import dayjs from "dayjs";
import TextArea from "antd/es/input/TextArea";
import {IFilament} from "../filaments/model";
import {ISpool} from "./model";
import {numberFormatter, numberParser} from "../../utils/parsing";

interface CreateOrCloneProps {
  mode: "create" | "clone";
}

export const SpoolCreate: React.FC<IResourceComponentsProps & CreateOrCloneProps> = (props) => {
  const t = useTranslate();

  const {form, formProps, saveButtonProps, formLoading} = useForm<ISpool>();

  if (props.mode === "clone" && formProps.initialValues) {
    // Clear out the values that we don't want to clone
    formProps.initialValues.first_used = null;
    formProps.initialValues.last_used = null;
    formProps.initialValues.used_weight = 0;

    // Fix the filament_id
    formProps.initialValues.filament_id = formProps.initialValues.filament.id;
  }

  const {queryResult} = useSelect<IFilament>({
    resource: "filament",
  });

  const filamentOptions = queryResult.data?.data.map((item) => {
    let vendorPrefix = "";
    if (item.vendor) {
      vendorPrefix = `${item.vendor.name} - `;
    }
    let name = item.name;
    if (!name) {
      name = `ID: ${item.id}`;
    }
    let material = "";
    if (item.material) {
      material = ` - ${item.material}`;
    }
    const label = `${vendorPrefix}${name}${material}`;

    return {
      label: label,
      value: item.id,
      weight: item.weight,
      spool_weight: item.spool_weight
    };
  });
  filamentOptions?.sort((a, b) => a.label.localeCompare(b.label, undefined, {sensitivity: "base"}));

  const [usedWeight, setUsedWeight] = useState(0);

  const selectedFilamentID = Form.useWatch('filament_id', form);
  const selectedFilament = filamentOptions?.find(obj => {
    return obj.value === selectedFilamentID;
  });
  const filamentWeight = selectedFilament?.weight || 0;
  const spoolWeight = selectedFilament?.spool_weight || 0;

  const weightChange = (weight: number) => {
    setUsedWeight(weight);
    form.setFieldsValue(
      {
        used_weight: weight
      });
  }

  return (
    <Create
      title={props.mode === "create" ? t("spool.titles.create") : t("spool.titles.clone")}
      saveButtonProps={saveButtonProps}
      isLoading={formLoading}
    >
      <Form {...formProps} layout="vertical">
        <Form.Item
          label={t("spool.fields.first_used")}
          name={["first_used"]}
          rules={[
            {
              required: false,
            },
          ]}
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
          <DatePicker showTime format="YYYY-MM-DD HH:mm:ss"/>
        </Form.Item>
        <Form.Item
          label={t("spool.fields.last_used")}
          name={["last_used"]}
          rules={[
            {
              required: false,
            },
          ]}
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
          <DatePicker showTime format="YYYY-MM-DD HH:mm:ss"/>
        </Form.Item>
        <Form.Item
          label={t("spool.fields.filament")}
          name={["filament_id"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Select
            options={filamentOptions}
            showSearch
            filterOption={(input, option) =>
              typeof option?.label === "string" && option?.label.toLowerCase().includes(input.toLowerCase())
            }
          />
        </Form.Item>
        <Form.Item
          hidden={true}
          name={["used_weight"]}
          initialValue={0}
        >
          <InputNumber
            value={usedWeight}
          />
        </Form.Item>

        <Form.Item
          label={t("spool.fields.used_weight")}
          help={t("spool.fields_help.used_weight")}
          // name={["used_weight"]}
          initialValue={0}
        >
          <InputNumber
            min={0}
            addonAfter="g"
            precision={1}
            formatter={numberFormatter}
            parser={numberParser}
            value={usedWeight}
            onChange={(value) => {
              weightChange(value ?? 0);
            }}
          />
        </Form.Item>
        <Form.Item
          label={t("spool.fields.remaining_weight")}
          help={t("spool.fields_help.remaining_weight")}
          // name={["remaining_weight"]}
          initialValue={0}
        >
          <InputNumber
            min={0}
            addonAfter="g"
            precision={1}
            formatter={numberFormatter}
            parser={numberParser}
            disabled={!filamentWeight}
            value={filamentWeight ? filamentWeight - usedWeight : 0}
            onChange={(value) => {
              weightChange(filamentWeight - (value ?? 0));
            }}
          />
        </Form.Item>
        <Form.Item
          label={t("spool.fields.measured_weight")}
          help={t("spool.fields_help.measured_weight")}
          // name={["measured_weight"]}
          initialValue={0}
        >
          <InputNumber
            min={0}
            addonAfter="g"
            precision={1}
            formatter={numberFormatter}
            parser={numberParser}
            disabled={!(filamentWeight && spoolWeight)}
            value={(filamentWeight && spoolWeight) ? filamentWeight - usedWeight + spoolWeight : 0}
            onChange={(value) => {
              weightChange(filamentWeight - ((value ?? 0) - spoolWeight));
            }}
          />
        </Form.Item>
        <Form.Item
          label={t("spool.fields.location")}
          help={t("spool.fields_help.location")}
          name={["location"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Input maxLength={64}/>
        </Form.Item>
        <Form.Item
          label={t("spool.fields.lot_nr")}
          help={t("spool.fields_help.lot_nr")}
          name={["lot_nr"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Input maxLength={64}/>
        </Form.Item>
        <Form.Item
          label={t("spool.fields.comment")}
          name={["comment"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <TextArea maxLength={1024}/>
        </Form.Item>
      </Form>
    </Create>
  );
};

export default SpoolCreate;
