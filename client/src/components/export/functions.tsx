import { ISpool } from "../../pages/spools/model";

export type PNGExportOptions = {
    boxSize?: number;
    padding?: number;
    useFullURL?: boolean;
}

export type CSVExportOptions<T> = {
    delimiter: string;
    includeHeaders: boolean;
} & CSVTypeExportOptions<T>;

type BaseTypes = string | number | boolean | Date | null | undefined;

type CSVTypeExportOptions<T> = {
    [key in keyof T]?: T[key] extends BaseTypes ? boolean : CSVTypeExportOptions<T[key]>;
};

export function exportAsCSV<T>(items: T[], opts: CSVExportOptions<T>) {
    let csvContent = "data:text/csv;charset=utf-8,";

    const omitters = ["delimiter", "includeHeaders"];
    let exportOpts: any = { ...opts };
    omitters.forEach((omitter) => {
        delete exportOpts[omitter];
    });

    if (opts.includeHeaders) {
        const headers = csvHeaderRecursion("", exportOpts);
        const sortedByKeys = new Map([...headers.entries()].sort(csvSort));

        csvContent += Array.from(sortedByKeys.keys()).join(opts.delimiter);
        csvContent += "\n";
    }

    items.forEach((item) => {
        const items = csvItem("", item, exportOpts);
        const sortedByKeys = new Map([...items.entries()].sort(csvSort));
        debugger;

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

function csvItem(prefix: string, item: any, opts: any): Map<string, string> {
    let result = new Map<string, string>();

    for (let key in opts) {
        const shouldExport = opts[key];
        const value = item[key];
        if (shouldExport !== true && !(value instanceof Object)) {
            continue;
        }

        console.log(key, value);

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

function csvHeaderRecursion(prefix: string, opts: any): Map<string, string> {
    const result = new Map<string, string>();

    for (let key in opts) {
        const shouldExport = opts[key];
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

function csvSort(aAny: [string, string], bAny: [string, string]) {
    const a = aAny[0].toString();
    const b = bAny[0].toString();

    return a.toString().localeCompare(b.toString());
}

export const exportQRCode = (qrCodeContents: {title: string, data: string}[], opts: PNGExportOptions) => {
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