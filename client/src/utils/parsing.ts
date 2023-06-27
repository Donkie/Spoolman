
// Number formatter that nicely formats numbers with correct decimal separator
export function numberFormatter(value: number | undefined) {
    return value ? Number(value).toLocaleString() : "";
}

// Number parser that supports both comma and dot as decimal separator
export function numberParser(value: string | undefined) {
    return Number(value?.replace(",", ".") ?? 0);
}
