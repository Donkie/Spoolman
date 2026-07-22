import { IFilament } from "../filaments/model";

export enum WeightToEnter {
  used_weight = 1,
  remaining_weight = 2,
  measured_weight = 3,
}

export interface ISpool {
  id: number;
  registered: string;
  first_used?: string;
  last_used?: string;
  filament: IFilament;
  price?: number;
  initial_weight?: number;
  spool_weight?: number;
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

// ISpoolEditForm is the shape of the spool edit form — only user-editable fields.
// Omitted fields are either system-managed (id, registered), server-computed
// (remaining_weight, remaining_length, used_length), or controlled by a separate
// action (archived). filament is replaced by filament_id to match the form input.
// Adding a new editable field to ISpool should also be added to ISpoolEditForm;
// the comparableDefaults in spools/edit.tsx is typed against this and TypeScript
// will report a compile error there as a reminder.
export type ISpoolEditForm = Omit<
  ISpoolParsedExtras,
  "id" | "registered" | "filament" | "remaining_weight" | "remaining_length" | "used_length" | "archived"
> & {
  filament_id: number | string | null; // string for external filaments, number for internal
};
