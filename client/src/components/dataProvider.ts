import { AxiosInstance } from "axios";
import { stringify } from "query-string";
import { DataProvider } from "@refinedev/core";
import { axiosInstance } from "@refinedev/simple-rest";

type MethodTypes = "get" | "delete" | "head" | "options";
type MethodTypesWithBody = "post" | "put" | "patch";

const dataProvider = (
    apiUrl: string,
    httpClient: AxiosInstance = axiosInstance,
): Omit<
    Required<DataProvider>,
    "createMany" | "updateMany" | "deleteMany"
> => ({
    getList: async ({ resource, meta, pagination, sorters, filters }) => {
        const url = `${apiUrl}/${resource}`;

        const { headers: headersFromMeta, method, queryParams } = meta ?? {};
        const requestMethod = (method as MethodTypes) ?? "get";

        if (pagination && pagination.mode == "server") {
            const pageSize = pagination.pageSize ?? 10;
            const offset = ((pagination.current ?? 1) - 1) * pageSize;
            queryParams["limit"] = pageSize;
            queryParams["offset"] = offset;
        }

        if (sorters && sorters.length > 0) {
            queryParams["sort"] = sorters.map((sort) => {
                const field = sort.field.replace("_", ".")
                return `${field}:${sort.order}`;
            }).join(",")
        }

        if (filters && filters.length > 0) {
            filters.forEach(filter => {
                if (!("field" in filter)) {
                    throw Error("Filter must be a LogicalFilter.")
                }
                const field = filter.field.replace(".", "_")
                queryParams[field] = filter.value
            });
        }

        const { data } = await httpClient[requestMethod](
            `${url}`,
            {
                headers: headersFromMeta,
                params: queryParams,
            },
        );

        return {
            data,
            total: 100,
            //TODO: total: data.length,
        };
    },

    getMany: async () => {
        throw new Error("getMany not implemented");
    },

    create: async ({ resource, variables, meta }) => {
        const url = `${apiUrl}/${resource}`;

        const { headers, method } = meta ?? {};
        const requestMethod = (method as MethodTypesWithBody) ?? "post";

        const { data } = await httpClient[requestMethod](url, variables, {
            headers,
        });

        return {
            data,
        };
    },

    update: async ({ resource, id, variables, meta }) => {
        const url = `${apiUrl}/${resource}/${id}`;

        const { headers, method } = meta ?? {};
        const requestMethod = (method as MethodTypesWithBody) ?? "patch";

        const { data } = await httpClient[requestMethod](url, variables, {
            headers,
        });

        return {
            data,
        };
    },

    getOne: async ({ resource, id, meta }) => {
        const url = `${apiUrl}/${resource}/${id}`;

        const { headers, method } = meta ?? {};
        const requestMethod = (method as MethodTypes) ?? "get";

        const { data } = await httpClient[requestMethod](url, { headers });

        return {
            data,
        };
    },

    deleteOne: async ({ resource, id, variables, meta }) => {
        const url = `${apiUrl}/${resource}/${id}`;

        const { headers, method } = meta ?? {};
        const requestMethod = (method as MethodTypesWithBody) ?? "delete";

        const { data } = await httpClient[requestMethod](url, {
            data: variables,
            headers,
        });

        return {
            data,
        };
    },

    getApiUrl: () => {
        return apiUrl;
    },

    custom: async ({
        url,
        method,
        payload,
        query,
        headers,
    }) => {
        let requestUrl = `${url}?`;

        if (query) {
            requestUrl = `${requestUrl}&${stringify(query)}`;
        }

        if (headers) {
            httpClient.defaults.headers = {
                ...httpClient.defaults.headers,
                ...headers,
            };
        }

        let axiosResponse;
        switch (method) {
            case "put":
            case "post":
            case "patch":
                axiosResponse = await httpClient[method](url, payload);
                break;
            case "delete":
                axiosResponse = await httpClient.delete(url, {
                    data: payload,
                });
                break;
            default:
                axiosResponse = await httpClient.get(requestUrl);
                break;
        }

        const { data } = axiosResponse;

        return Promise.resolve({ data });
    },
});

export default dataProvider;
