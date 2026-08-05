import { useGetSetting } from "./querySettings";

export function useCurrency() {
  const { data: currency } = useGetSetting("currency");
  try {
    return JSON.parse(currency?.value ?? '"EUR"');
  } catch {
    return "EUR";
  }
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

export function useCurrencyFormatter() {
  const currency = useCurrency();
  let roundPrices = false;
  try {
    roundPrices = JSON.parse(useGetSetting("round_prices").data?.value ?? "false");
  } catch {
    roundPrices = false;
  }

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency,
    currencyDisplay: "narrowSymbol",
    notation: roundPrices ? "compact" : "standard",
  });
}
