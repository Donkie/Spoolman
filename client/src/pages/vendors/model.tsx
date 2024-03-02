import { ExportOption } from "../../utils/exportOption";

export interface IVendor {
  id: number;
  registered: string;
  name: string;
  comment?: string;
  extra: { [key: string]: string };
}

// IVendorParsedExtras is the same as IVendor, but with the extra field parsed into its real types
export type IVendorParsedExtras = Omit<IVendor, "extra"> & { extra?: { [key: string]: unknown } };

export function IVendorEportableKeys(t: {
  (key: string, options?: any, defaultMessage?: string | undefined): string;
  (key: string, defaultMessage?: string | undefined): string;
}): ExportOption<IVendor>[] {
  return [
    {
      value: "id",
      label: t("vendor.fields.id"),
    },
    {
      value: "registered",
      label: t("vendor.fields.registered"),
    },
    {
      value: "name",
      label: t("vendor.fields.name"),
    },
    {
      value: "comment",
      label: t("vendor.fields.comment"),
    },
    {
      value: "extra",
      label: t("settings.extra_fields.tab"),
    }
  ];
}