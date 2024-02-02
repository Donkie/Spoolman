import React, { useEffect, useState } from "react";
import { HttpError, IResourceComponentsProps, useTranslate } from "@refinedev/core";
import { Edit, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, DatePicker, Select, InputNumber, Radio, Divider, Alert, Typography } from "antd";
import dayjs from "dayjs";
import TextArea from "antd/es/input/TextArea";
import { IFilament } from "../filaments/model";
import { ISpool, ISpoolParsedExtras } from "./model";
import { numberFormatter, numberParser } from "../../utils/parsing";
import { useSpoolmanLocations } from "../../components/otherModels";
import { message } from "antd/lib";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { ExtraFieldFormItem, StringifiedExtras } from "../../components/extraFields";
import { ParsedExtras } from "../../components/extraFields";
import { getCurrencySymbol, useCurrency } from "../../utils/settings";

/*
The API returns the extra fields as JSON values, but we need to parse them into their real types
in order for Ant design's form to work properly. ParsedExtras does this for us.
We also need to stringify them again before sending them back to the API, which is done by overriding
the form's onFinish method. Form.Item's normalize should do this, but it doesn't seem to work.
*/

enum WeightToEnter {
  used_weight = 1,
  remaining_weight = 2,
  measured_weight = 3,
}

export const SpoolEdit: React.FC<IResourceComponentsProps> = () => {
  const t = useTranslate();
  const [messageApi, contextHolder] = message.useMessage();
  const [hasChanged, setHasChanged] = useState(false);
  const extraFields = useGetFields(EntityType.spool);
  const currency = useCurrency();

  const { form, formProps, saveButtonProps } = useForm<ISpool, HttpError, ISpool, ISpool>({
    liveMode: "manual",
    onLiveEvent() {
      // Warn the user if the spool has been updated since the form was opened
      messageApi.warning(t("spool.form.spool_updated"));
      setHasChanged(true);
    },
  });

  // Get filament selection options
  const { queryResult } = useSelect<IFilament>({
    resource: "filament",
  });

  // Add the filament_id field to the form
  if (formProps.initialValues) {
    formProps.initialValues["filament_id"] = formProps.initialValues["filament"].id;

    // Parse the extra fields from string values into real types
    formProps.initialValues = ParsedExtras(formProps.initialValues);
  }

  // Override the form's onFinish method to stringify the extra fields
  const originalOnFinish = formProps.onFinish;
  formProps.onFinish = (allValues: ISpoolParsedExtras) => {
    if (allValues !== undefined && allValues !== null) {
      // Lot of stupidity here to make types work
      const stringifiedAllValues = StringifiedExtras<ISpoolParsedExtras>(allValues);
      originalOnFinish?.({
        extra: {},
        ...stringifiedAllValues,
      });
    }
  };

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
      spool_weight: item.spool_weight,
    };
  });
  filamentOptions?.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

  const [weightToEnter, setWeightToEnter] = useState(1);
  const [usedWeight, setUsedWeight] = useState(0);

  const selectedFilamentID = Form.useWatch("filament_id", form);
  const selectedFilament = filamentOptions?.find((obj) => {
    return obj.value === selectedFilamentID;
  });
  const filamentWeight = selectedFilament?.weight || 0;
  const spoolWeight = selectedFilament?.spool_weight || 0;

  const filamentChange = (newID: number) => {
    const newSelectedFilament = filamentOptions?.find((obj) => {
      return obj.value === newID;
    });
    const filamentHasWeight = newSelectedFilament?.weight || 0;
    const filamentHasSpoolWeight = newSelectedFilament?.spool_weight || 0;

    if (weightToEnter == WeightToEnter.measured_weight) {
      if (!(filamentHasWeight && filamentHasSpoolWeight)) {
        setWeightToEnter(WeightToEnter.remaining_weight);
      }
    }
    if (weightToEnter == WeightToEnter.remaining_weight || weightToEnter == WeightToEnter.measured_weight) {
      if (!filamentHasWeight) {
        setWeightToEnter(WeightToEnter.used_weight);
      }
    }
  };

  const weightChange = (weight: number) => {
    setUsedWeight(weight);
    form.setFieldValue("used_weight", weight);
  };

  const locations = useSpoolmanLocations(true);
  const [newLocation, setNewLocation] = useState("");

  const allLocations = [...(locations.data || [])];
  if (newLocation.trim() && !allLocations.includes(newLocation)) {
    allLocations.push(newLocation.trim());
  }

  const initialUsedWeight = formProps.initialValues?.used_weight || 0;
  useEffect(() => {
    if (initialUsedWeight) {
      setUsedWeight(initialUsedWeight);
    }
  }, [initialUsedWeight]);

  return (
    <Edit saveButtonProps={saveButtonProps}>
      {contextHolder}
      <Form {...formProps} layout="vertical">
        <Form.Item
          label={t("spool.fields.id")}
          name={["id"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Input readOnly disabled />
        </Form.Item>
        <Form.Item
          label={t("spool.fields.registered")}
          name={["registered"]}
          rules={[
            {
              required: true,
            },
          ]}
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
          <DatePicker disabled showTime format="YYYY-MM-DD HH:mm:ss" />
        </Form.Item>
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
          <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" />
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
          <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" />
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
            onChange={(value) => {
              filamentChange(value);
            }}
          />
        </Form.Item>
        <Form.Item
          label={t("spool.fields.price")}
          help={t("spool.fields_help.price")}
          name={["price"]}
          rules={[
            {
              required: false,
              type: "number",
              min: 0,
            },
          ]}
        >
          <InputNumber
            addonAfter={getCurrencySymbol(undefined, currency)}
            precision={2}
            formatter={numberFormatter}
            parser={numberParser}
          />
        </Form.Item>
        <Form.Item hidden={true} name={["used_weight"]} initialValue={0}>
          <InputNumber value={usedWeight} />
        </Form.Item>
        <Form.Item label={t("spool.fields.weight_to_use")} help={t("spool.fields_help.weight_to_use")}>
          <Radio.Group
            onChange={(value) => {
              setWeightToEnter(value.target.value);
            }}
            defaultValue={WeightToEnter.used_weight}
            value={weightToEnter}
          >
            <Radio.Button value={WeightToEnter.used_weight}>{t("spool.fields.used_weight")}</Radio.Button>
            <Radio.Button value={WeightToEnter.remaining_weight} disabled={!filamentWeight}>
              {t("spool.fields.remaining_weight")}
            </Radio.Button>
            <Radio.Button value={WeightToEnter.measured_weight} disabled={!(filamentWeight && spoolWeight)}>
              {t("spool.fields.measured_weight")}
            </Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Form.Item label={t("spool.fields.used_weight")} help={t("spool.fields_help.used_weight")}>
          <InputNumber
            min={0}
            addonAfter="g"
            precision={1}
            formatter={numberFormatter}
            parser={numberParser}
            disabled={weightToEnter != WeightToEnter.used_weight}
            value={usedWeight}
            onChange={(value) => {
              weightChange(value ?? 0);
            }}
          />
        </Form.Item>
        <Form.Item label={t("spool.fields.remaining_weight")} help={t("spool.fields_help.remaining_weight")}>
          <InputNumber
            min={0}
            addonAfter="g"
            precision={1}
            formatter={numberFormatter}
            parser={numberParser}
            disabled={weightToEnter != WeightToEnter.remaining_weight}
            value={filamentWeight ? filamentWeight - usedWeight : 0}
            onChange={(value) => {
              weightChange(filamentWeight - (value ?? 0));
            }}
          />
        </Form.Item>
        <Form.Item label={t("spool.fields.measured_weight")} help={t("spool.fields_help.measured_weight")}>
          <InputNumber
            min={0}
            addonAfter="g"
            precision={1}
            formatter={numberFormatter}
            parser={numberParser}
            disabled={weightToEnter != WeightToEnter.measured_weight}
            value={filamentWeight && spoolWeight ? filamentWeight - usedWeight + spoolWeight : 0}
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
          <Select
            dropdownRender={(menu) => (
              <>
                {menu}
                <Divider style={{ margin: "8px 0" }} />
                <Input
                  placeholder={t("spool.form.new_location_prompt")}
                  value={newLocation}
                  onChange={(event) => setNewLocation(event.target.value)}
                />
              </>
            )}
            loading={locations.isLoading}
            options={allLocations.map((item) => ({ label: item, value: item }))}
          />
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
          <Input maxLength={64} />
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
          <TextArea maxLength={1024} />
        </Form.Item>
        <Typography.Title level={5}>{t("settings.extra_fields.tab")}</Typography.Title>
        {extraFields.data?.map((field, index) => (
          <ExtraFieldFormItem key={index} field={field} />
        ))}
      </Form>
      {hasChanged && <Alert description={t("spool.form.spool_updated")} type="warning" showIcon />}
    </Edit>
  );
};

export default SpoolEdit;
