export type QRExportOptions = {
    boxSize?: number;
    padding?: number;
    useFullURL?: boolean;
}

export type CSVExportOptions<T> = {
    delimiter: string;
    includeHeaders: boolean;
} & CSVTypeExportOptions<T>;

// Base types that can be exported to CSV.
type BaseTypes = string | number | boolean | Date | null | undefined;

// Recursive type that allows for nested objects to be defined as exportable or not.
type CSVTypeExportOptions<T> = {
    [key in keyof T]?: T[key] extends BaseTypes ? boolean : CSVTypeExportOptions<T[key]>;
};

// Function that takes in an array of items and downloads the resulting CSV file.
export function exportAsCSV<T>(items: T[], opts: CSVExportOptions<T>) {
    let csvContent = "data:text/csv;charset=utf-8,";

    // Omit the delimiter and includeHeaders from the export options.
    const omitters = ["delimiter", "includeHeaders"];
    let exportOpts: any = { ...opts };
    omitters.forEach((omitter) => {
        delete exportOpts[omitter];
    });

    if (opts.includeHeaders) {
        const headers = csvHeaderRecursion("", exportOpts);
        // We sort the headers by key to ensure that the headers are always in the same order.
        // Otherwise the user could change the order, by disabling and enabling the headers in another order.
        // This could lead to confusion.
        const sortedByKeys = new Map([...headers.entries()].sort(csvSort));

        csvContent += Array.from(sortedByKeys.keys()).join(opts.delimiter);
        csvContent += "\n";
    }

    items.forEach((item) => {
        const items = csvItem("", item, exportOpts);
        // We sort the headers by key to ensure that the headers are always in the same order.
        // Otherwise the user could change the order, by disabling and enabling the headers in another order.
        // This could lead to confusion.
        const sortedByKeys = new Map([...items.entries()].sort(csvSort));

        csvContent += Array.from(sortedByKeys.values()).join(opts.delimiter);
        csvContent += "\n";
    });

    const encodedUri = encodeURI(csvContent);

    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "spools.csv");
    document.body.appendChild(link); // Required for FF
    link.click();
};

// Recusively create a map of the items to be exported.
function csvItem(prefix: string, item: any, opts: any): Map<string, string> {
    let result = new Map<string, string>();

    for (let key in opts) {
        const shouldExport = opts[key];
        const value = item[key];
        // Check if the user wants to export this field.
        // If its an object, we need to recurse into it.
        if (shouldExport !== true && !(value instanceof Object)) {
            continue;
        }

        if (value instanceof Object) {
            const subMap = csvItem(prefix + key + '.', value, opts[key]);
            subMap.forEach((val, key) => {
                result.set(key, val);
            });
        } else {
            result.set(prefix + key, value);
        }
    }

    return result;
}

// Recusively create a map of the items to be exported.
function csvHeaderRecursion(prefix: string, opts: any): Map<string, string> {
    const result = new Map<string, string>();

    for (let key in opts) {
        const shouldExport = opts[key];
        // Check if the user wants to export this field.
        // If its an object, we need to recurse into it.
        if (shouldExport !== true && !(shouldExport instanceof Object)) {
            continue;
        }

        const header = opts[key];

        if (header instanceof Object) {
            const subMap = csvHeaderRecursion(prefix + key + '.', header);
            subMap.forEach((val, key) => {
                result.set(key, val);
            });
        } else {
            result.set(prefix + key, header);
        }
    }

    return result;
}

// Sort the CSV entries by key.
// This is to ensure that the values are always in the same order.
// This also ensures that id is always the first column.
function csvSort(aAny: [string, string], bAny: [string, string]) {
    const a = aAny[0].toString();
    const b = bAny[0].toString();

    const remainingA = a.split('.').slice(0, -1).join('.');
    const remainingB = b.split('.').slice(0, -1).join('.');

    console.log(remainingA, remainingB);

    const compare = remainingA.localeCompare(remainingB);
    if (compare !== 0) {
        return compare;
    }

    const lastBPart = b.split('.').pop();
    const lastAPart = a.split('.').pop();

    if (lastAPart === undefined || lastBPart === undefined) {
        return 0;
    }

    if (lastAPart === 'id') {
        return -1;
    }

    if (lastBPart === 'id') {
        return 1;
    }

    return lastAPart.localeCompare(lastBPart);
}

/// Function that takes in an array of items and downloads the resulting QR code files.
/// The title is used as the filename for the QR code.
/// The data is the content of the QR code.
export const exportQRCode = (qrCodeContents: {title: string, data: string}[], opts: QRExportOptions) => {
    const apiEndpoint = import.meta.env.VITE_APIURL;

    const url = `${apiEndpoint}/qr`;

    for (let i = 0; i < qrCodeContents.length; i++) {
        const content = qrCodeContents[i];

        const body = JSON.stringify({
            data: content.data,
            box_size: opts.boxSize,
            border: opts.padding
        });

        fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: body
        }).then((response) => {
            return response.blob();
        }).then((blob) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `${content.title}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }
};