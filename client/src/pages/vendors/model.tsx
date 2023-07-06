export interface IVendor {
  id: number;
  registered: string;
  name: string;
  comment?: string;
  [key: string]: unknown;
}
