interface ISpool {
  id: string;
  registered: string;
  first_used?: string;
  last_used?: string;
  filament: IFilament;
  remaining_weight?: number;
  used_weight: number;
  location?: string;
  lot_nr?: string;
  comment?: string;
}
