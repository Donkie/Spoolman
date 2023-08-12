
// Number formatter that nicely formats numbers with correct decimal separator
export function numberFormatter(value: number | undefined) {
    return value ? Number(value).toLocaleString() : "";
}

// Number parser that supports both comma and dot as decimal separator
export function numberParser(value: string | undefined) {
    // Convert comma to dot
    const decimalSeparator = (1.1).toLocaleString().charAt(1);
    if (decimalSeparator === ",") {
        value = value?.replace(",", ".");
    }

    // Remove all non-digit characters
    value = value?.replace(/[^\d.-]/g, "");

    // Parse as float
    return parseFloat(value || "0");
}
