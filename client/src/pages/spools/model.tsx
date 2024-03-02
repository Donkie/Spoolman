import { IFilament, IFilamentEportableKeys } from "../filaments/model";
import { ExportOption } from "../../utils/exportOption";

export interface ISpool {
  id: number;
  registered: string;
  first_used?: string;
  last_used?: string;
  filament: IFilament;
  price?: number;
  remaining_weight?: number;
  used_weight: number;
  remaining_length?: number;
  used_length: number;
  location?: string;
  lot_nr?: string;
  comment?: string;
  archived: boolean;
  extra: { [key: string]: string };
}

// ISpoolParsedExtras is the same as ISpool, but with the extra field parsed into its real types
export type ISpoolParsedExtras = Omit<ISpool, "extra"> & { extra?: { [key: string]: unknown } };

export function ISpoolEportableKeys(t: {
  (key: string, options?: any, defaultMessage?: string | undefined): string;
  (key: string, defaultMessage?: string | undefined): string;
}): ExportOption<ISpool>[] {
  return [
    {
      value: "id",
      label: t("spool.fields.id"),
    },
    {
      value: "registered",
      label: t("spool.fields.registered"),
    },
    {
      value: "first_used",
      label: t("spool.fields.first_used"),
    },
    {
      value: "last_used",
      label: t("spool.fields.last_used"),
    },
    {
      value: "filament",
      label: t("filament.filament"),
      children: IFilamentEportableKeys(t).map((key) => ({ ...key, label: `${t('filament.filament')}.${key.label}` })),
    },
    {
      value: "price",
      label: t("spool.fields.price"),
    },
    {
      value: "remaining_weight",
      label: t("spool.fields.remaining_weight"),
    },
    {
      value: "used_weight",
      label: t("spool.fields.used_weight"),
    },
    {
      value: "remaining_length",
      label: t("spool.fields.remaining_length"),
    },
    {
      value: "used_length",
      label: t("spool.fields.used_length"),
    },
    {
      value: "location",
      label: t("spool.fields.location"),
    },
    {
      value: "lot_nr",
      label: t("spool.fields.lot_nr"),
    },
    {
      value: "comment",
      label: t("spool.fields.comment"),
    },
    {
      value: "archived",
      label: t("spool.fields.archived"),
    },
    {
      value: "extra",
      label: t("settings.extra_fields.tab"),
    }
  ];
}