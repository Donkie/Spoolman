import { useGetSetting } from "./querySettings";

export function useCurrency() {
  const { data: currency } = useGetSetting("currency");
  return JSON.parse(currency?.value ?? '"EUR"');
}

export function getCurrencySymbol(locale: string | undefined, currency: string) {
  return (0)
    .toLocaleString(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
    .replace(/\d/g, "")
    .trim();
}
