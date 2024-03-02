import { ExportOption } from "../../utils/exportOption";
import { IVendor, IVendorEportableKeys } from "../vendors/model";

export interface IFilament {
  id: number;
  registered: string;
  name?: string;
  vendor?: IVendor;
  material?: string;
  price?: number;
  density: number;
  diameter: number;
  weight?: number;
  spool_weight?: number;
  article_number?: string;
  comment?: string;
  settings_extruder_temp?: number;
  settings_bed_temp?: number;
  color_hex?: string;
  extra: { [key: string]: string };
}

// IFilamentParsedExtras is the same as IFilament, but with the extra field parsed into its real types
export type IFilamentParsedExtras = Omit<IFilament, "extra"> & { extra?: { [key: string]: unknown } };

export function IFilamentEportableKeys(t: {
  (key: string, options?: any, defaultMessage?: string | undefined): string;
  (key: string, defaultMessage?: string | undefined): string;
}): ExportOption<IFilament>[] {
  return [
  {
    value: "id",
    label: t("filament.fields.id"),
  },
  {
    value: "registered",
    label: t("filament.fields.registered"),
  },
  {
    value: "name",
    label: t("filament.fields.name"),
  },
  {
    value: "material",
    label: t("filament.fields.material"),
  },
  {
    value: "price",
    label: t("filament.fields.price"),
  },
  {
    value: "density",
    label: t("filament.fields.density"),
  },
  {
    value: "diameter",
    label: t("filament.fields.diameter"),
  },
  {
    value: "weight",
    label: t("filament.fields.weight"),
  },
  {
    value: "spool_weight",
    label: t("filament.fields.spool_weight"),
  },
  {
    value: "article_number",
    label: t("filament.fields.article_number"),
  },
  {
    value: "comment",
    label: t("filament.fields.comment"),
  },
  {
    value: "settings_extruder_temp",
    label: t("filament.fields.settings_extruder_temp"),
  },
  {
    value: "settings_bed_temp",
    label: t("filament.fields.settings_bed_temp"),
  },
  {
    value: "color_hex",
    label: t("filament.fields.color_hex"),
  },
  {
    value: "vendor",
    label: t("vendor.vendor"),
    children: IVendorEportableKeys(t).map((key) => ({ ...key, label: `${t("vendor.vendor")}.${key.label}` })),
  },
  {
    value: "extra",
    label: t("settings.extra_fields.tab"),
  }
];
}