export const flatten = (data: object, prefix: string = '', delimiter: string = '.') => {
  const result: { [key: string]: string | number | null } = {};

  Object.entries(data).forEach(([key, value]) => {
    if (typeof value === 'object') {
      Object.assign(result, flatten(value, `${prefix}${key}${delimiter}`, delimiter));
    } else {
      result[`${prefix}${key}`] = value;
    }
  });

  return result;
};
