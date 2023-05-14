import { IVendor } from "../vendors/model";

export interface IFilament {
  id: string;
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
}
