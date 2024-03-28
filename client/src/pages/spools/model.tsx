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
  empty_weight?: number;
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
