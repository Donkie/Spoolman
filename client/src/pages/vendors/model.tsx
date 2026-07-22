export interface IVendor {
  id: number;
  registered: string;
  name: string;
  comment?: string;
  empty_spool_weight?: number;
  external_id?: string;
  extra: { [key: string]: string };
}

// IVendorParsedExtras is the same as IVendor, but with the extra field parsed into its real types
export type IVendorParsedExtras = Omit<IVendor, "extra"> & { extra?: { [key: string]: unknown } };

// IVendorEditForm is the shape of the vendor edit form — only user-editable fields.
// id and registered are system-managed.
// Adding a new editable field to IVendor should also be added here;
// comparableDefaults in vendors/edit.tsx is typed against this.
export type IVendorEditForm = Omit<IVendorParsedExtras, "id" | "registered">;
