import { useSelect, useTranslate } from "@refinedev/core";
import { useQueries } from "@tanstack/react-query";
import { Form, InputNumber, Modal, Radio, DatePicker } from "antd";
import { useForm } from "antd/es/form/Form";
import { useCallback, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { formatLength, formatWeight } from "../../utils/parsing";
import { SpoolType, useGetExternalDBFilaments } from "../../utils/queryExternalDB";
import { getAPIURL } from "../../utils/url";
import { IFilament } from "../filaments/model";
import { ISpool } from "./model";

dayjs.extend(utc);

export async function setSpoolArchived(spool: ISpool, archived: boolean) {
  const init: RequestInit = {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      archived: archived,
    }),
  };
  const request = new Request(getAPIURL() + "/spool/" + spool.id);
  await fetch(request, init);
}

/**
 * Use some spool filament from this spool. Either specify length or weight.
 * @param spool The spool
 * @param length The length to add/subtract from the spool, in mm
 * @param weight The weight to add/subtract from the spool, in g
 */
export async function useSpoolFilament(spool: ISpool, length?: number, weight?: number) {
  const init: RequestInit = {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      use_length: length,
      use_weight: weight,
    }),
  };
  const request = new Request(`${getAPIURL()}/spool/${spool.id}/use`);
  await fetch(request, init);
}

/**
 * Adjust usage based on the spool's current gross weight
 * @param spool The spool
 * @param weight The weight of the spool, in g
 */
export async function useSpoolFilamentMeasure(spool: ISpool, weight: number) {
  const init: RequestInit = {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      weight: weight,
    }),
  };
  const request = new Request(`${getAPIURL()}/spool/${spool.id}/measure`);
  await fetch(request, init);
}


/**
 * Returns an array of queries using the useQueries hook from @tanstack/react-query.
 * Each query fetches a spool by its ID from the server.
 *
 * @param {number[]} ids - An array of spool IDs to fetch.
 * @return An array of query results, each containing the fetched spool data.
 */
export function useGetSpoolsByIds(ids: number[]) {
  return useQueries({
    queries: ids.map((id) => {
      return {
        queryKey: ["spool", id],
        queryFn: async () => {
          const res = await fetch(getAPIURL() + "/spool/" + id);
          return (await res.json()) as ISpool;
        },
      };
    }),
  });
}

/**
 * Formats a filament label with the given parameters.
 */
export function formatFilamentLabel(
  name: string,
  diameter: number,
  vendorName?: string,
  material?: string,
  weight?: number,
  spoolType?: SpoolType
): string {
  const portions = [];
  if (vendorName) {
    portions.push(vendorName);
  }
  portions.push(name);
  const extras = [];
  if (material) {
    extras.push(material);
  }
  extras.push(formatLength(diameter));
  if (weight) {
    extras.push(formatWeight(weight));
  }
  if (spoolType) {
    extras.push(spoolType.charAt(0).toUpperCase() + spoolType.slice(1) + " spool");
  }
  return `${portions.join(" - ")} (${extras.join(", ")})`;
}

interface SelectOption {
  label: string;
  value: string | number;
  weight?: number;
  spool_weight?: number;
  is_internal: boolean;
}

export function useGetFilamentSelectOptions() {
  // Setup hooks
  const t = useTranslate();
  const { queryResult: internalFilaments } = useSelect<IFilament>({
    resource: "filament",
  });
  const externalFilaments = useGetExternalDBFilaments();

  // Format and sort internal filament options
  const filamentSelectInternal: SelectOption[] = useMemo(() => {
    const data =
      internalFilaments.data?.data.map((item) => {
        return {
          label: formatFilamentLabel(
            item.name ?? `ID ${item.id}`,
            item.diameter,
            item.vendor?.name,
            item.material,
            item.weight
          ),
          value: item.id,
          weight: item.weight,
          spool_weight: item.spool_weight,
          is_internal: true,
        };
      }) ?? [];
    data.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    return data;
  }, [internalFilaments.data?.data]);

  // Format and sort external filament options
  const filamentSelectExternal: SelectOption[] = useMemo(() => {
    const data =
      externalFilaments.data?.map((item) => {
        return {
          label: formatFilamentLabel(
            item.name,
            item.diameter,
            item.manufacturer,
            item.material,
            item.weight,
            item.spool_type
          ),
          value: item.id,
          weight: item.weight,
          spool_weight: item.spool_weight || undefined,
          is_internal: false,
        };
      }) ?? [];
    data.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    return data;
  }, [externalFilaments.data]);

  return {
    options: [
      {
        label: <span>{t("spool.fields.filament_internal")}</span>,
        options: filamentSelectInternal,
      },
      {
        label: <span>{t("spool.fields.filament_external")}</span>,
        options: filamentSelectExternal,
      },
    ],
    internalSelectOptions: filamentSelectInternal,
    externalSelectOptions: filamentSelectExternal,
    allExternalFilaments: externalFilaments.data,
  };
}

type MeasurementType = "length" | "weight" | "measured_weight";

export function useSpoolAdjustModal() {
  const t = useTranslate();
  const [form] = useForm();

  const [curSpool, setCurSpool] = useState<ISpool | null>(null);
  const [measurementType, setMeasurementType] = useState<MeasurementType>("length");
  const inputNumberRef = useRef<HTMLInputElement | null>(null);

  const openSpoolAdjustModal = useCallback((spool: ISpool) => {
    setCurSpool(spool);
    setTimeout(() => {
      inputNumberRef.current?.focus();
    }, 0);
  }, []);

  const spoolAdjustModal = useMemo(() => {
    if (curSpool === null) {
      return null;
    }

    const onSubmit = async () => {
      if (curSpool === null) {
        return;
      }

      const value = form.getFieldValue("filament_value");
      if (value === undefined || value === null) {
        return;
      }

      if (measurementType === "length") {
        await useSpoolFilament(curSpool, value, undefined);
      } else if (measurementType === "weight") {
        await useSpoolFilament(curSpool, undefined, value);
      } else {
        await useSpoolFilamentMeasure(curSpool, value);
      }

      setCurSpool(null);
    };

    return (
      <Modal title={t("spool.titles.adjust")} open onCancel={() => setCurSpool(null)} onOk={form.submit}>
        <p>{t("spool.form.adjust_filament_help")}</p>
        <Form form={form} initialValues={{ measurement_type: measurementType }} onFinish={onSubmit}>
          <Form.Item label={t("spool.form.measurement_type_label")} name="measurement_type">
            <Radio.Group
              value={measurementType}
              onChange={({ target: { value } }) => setMeasurementType(value as MeasurementType)}
            >
              <Radio.Button value="length">{t("spool.form.measurement_type.length")}</Radio.Button>
              <Radio.Button value="weight">{t("spool.form.measurement_type.weight")}</Radio.Button>
              <Radio.Button value="measured_weight">{t("spool.fields.measured_weight")}</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item label={t("spool.form.adjust_filament_value")} name="filament_value">
            <InputNumber ref={inputNumberRef} precision={1} addonAfter={measurementType === "length" ? "mm" : "g"} />
          </Form.Item>
        </Form>
      </Modal>
    );
  }, [curSpool, measurementType, t]);

  return {
    openSpoolAdjustModal,
    spoolAdjustModal,
  };
}

/**
 * Hook to provide a modal for drying a spool with a date/time input.
 * On submit, POSTs to /api/v1/spool/dry with {"dried_at": "<ISO string>"}.
 */
export function useSpoolDryModal() {
  const t = useTranslate();
  const [form] = useForm();

  const [curSpool, setCurSpool] = useState<ISpool | null>(null);

  const openSpoolDryModal = useCallback((spool: ISpool) => {
    setCurSpool(spool);
    // Set initial form value to now
    form.setFieldsValue({ dried_at: dayjs() });
  }, [form]);

  const spoolDryModal = useMemo(() => {
    if (curSpool === null) {
      return null;
    }

    const onSubmit = async () => {
      if (curSpool === null) {
        return;
      }

      const driedAt = form.getFieldValue("dried_at");
      if (!driedAt) {
        return;
      }

      const driedAtISO = driedAt.toISOString();

      const init: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dried_at: driedAtISO,
        }),
      };
      const request = new Request(`${getAPIURL()}/spool/${curSpool.id}/dry`);
      await fetch(request, init);

      setCurSpool(null);
    };

    return (
      <Modal title={t("spool.titles.dry")} open onCancel={() => setCurSpool(null)} onOk={form.submit}>
        <p>{t("spool.form.dry_help")}</p>
        <Form form={form} initialValues={{ dried_at: dayjs() }} onFinish={onSubmit}>
          <Form.Item
            label={t("spool.form.dried_at")}
            name="dried_at"
            rules={[{ required: true, message: t("spool.form.dried_at_required") }]}
          >
            <DatePicker showTime allowClear={false} />
          </Form.Item>
        </Form>
      </Modal>
    );
  }, [curSpool, form, t]);

  return {
    openSpoolDryModal,
    spoolDryModal,
  };
}