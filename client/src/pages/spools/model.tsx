import { IFilament } from "../filaments/model";

export interface ISpool {
  id: number;
  registered: string;
  first_used?: string;
  last_used?: string;
  filament: IFilament;
  remaining_weight?: number;
  used_weight: number;
  remaining_length?: number;
  used_length: number;
  location?: string;
  lot_nr?: string;
  comment?: string;
  archived: boolean;
}
