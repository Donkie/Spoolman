type ItemKey = string | number;

export type CSVExportConfig = {
    delimiter: string;
    includeHeaders: boolean;
    filename: string;
};

export type CSVExportOptions<T> = CSVExportConfig & {
    options: ItemKey[][];
};

// Function that takes in an array of items and downloads the resulting CSV file.
export function exportAsCSV<T>(items: T[], opts: CSVExportOptions<T>) {
    let csvContent = "data:text/csv;charset=utf-8,";

    const content = parseCSV(items, opts.options);
    const sortedContent = mapSort(content);

    if(opts.includeHeaders) {
        csvContent += Array.from(sortedContent.keys()).join(opts.delimiter);
        csvContent += "\n";
    }

    for (let i = 0; i < items.length; i++) {
        for(const value of sortedContent.values()) {
            csvContent += value[i] ?? "";
            csvContent += opts.delimiter;
        }

        csvContent = csvContent.slice(0, opts.delimiter.length * -1);
        csvContent += "\n";
    }
    

    const encodedUri = encodeURI(csvContent);

    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${opts.filename}.csv`);
    document.body.appendChild(link); // Required for FF
    link.click();

    document.body.removeChild(link);
};

/// Function that takes in an array of items and returns a map of the CSV content.
/// The keys are the headers of the CSV file, and the values are the content of the CSV file.
function parseCSV<T>(items: T[], keys: ItemKey[][]): Map<string, string[]>{
    let result = new Map<string, string[]>();

    for (let item of items) {
        for (let key of keys) {
            // Skip empty keys.
            if(key.length === 0) {
                continue;
            }
    
            // If the key is a single value, we can just add it to the map.
            if(key.length === 1) {
                const value = item[key[0] as keyof T];
                // If the value is null or undefined, we should add an empty string to the map.
                // Technically, we don't need to, as this should be handled later anyways, but it's better safe than sorry.
                if(value === null || value === undefined) {
                    setOrPush(result, `${key}`, "");
                    continue;
                }
    
                // If the value is a Object, we want to add all the keys of the object to the map.
                if(value instanceof Object) {
                    const subMap = parseCSV([value], Object.keys(value).map((k) => [k]));
                    subMap.forEach((v, k) => {
                        setOrPush(result, `${key}.${k}`, ...v);
                    });
                    continue;
                }

                setOrPush(result, `${key}`, String(item[key[0] as keyof T]));
                continue;
            }
    
            const subMap = parseCSV([item[key[0] as keyof T]], [key.slice(1)]);
            subMap.forEach((v, k) => {
                setOrPush(result, `${key[0]}.${k}`, ...v);
            });
        }
    }

    return result;
}

/// Add the value to the map if the key is not present, otherwise push the value to the array.
function setOrPush<T>(map: Map<string, T[]>, key: string, ...value: T[]) {
    if(map.has(key)) {
        map.set(key, [...map.get(key)!, ...value]);
        return;
    }

    map.set(key, value);
}

/// Sort the map so that the id is always first, and the rest is sorted alphabetically.
function mapSort<T>(map: Map<string, T[]>) {
    return new Map([...map.entries()].sort(
        ([key1, _], [key2, __]) => {
            const a = key1.split('.');
            const b = key2.split('.');

            if(a.length === 0 || b.length === 0) {
                return a.length === 0 ? -1 : 1;
            }

            // If the length of the keys are different, the shorter one should be first.
            if(a.length != b.length) {
                return a.length - b.length;
            }

            const maxLength = Math.min(a.length, b.length) - 1;

            // If the id is present, it should always be first.
            if(a[maxLength] === "id" || b[maxLength] === "id") {
                return a[maxLength] === "id" ? -1 : 1;
            }

            return a[maxLength].localeCompare(b[maxLength]);
        }
    ));
}