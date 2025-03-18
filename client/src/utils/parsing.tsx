import React from "react";

/**
 * Insert blankspace thousands separator into a number
 * Supports both period or comma as decimal separator
 * @param input
 * @returns
 */
export function formatNumberWithSpaceSeparator(input: string): string {
  const isPeriodDecimalSeparator = input.indexOf(".") > -1;

  const parts = input.split(isPeriodDecimalSeparator ? "." : ",");

  const integerPart = parts[0];
  const decimalPart = parts[1] || "";

  // Add the thousands separator (blank space) to the integer part
  const formattedIntegerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  // Combine the formatted integer and decimal parts
  const suffix = decimalPart ? (isPeriodDecimalSeparator ? "." : ",") + decimalPart : "";
  const formattedNumber = formattedIntegerPart + suffix;

  return formattedNumber;
}

/**
 * Number formatter compatible with Ant Design's InputNumber component, handling UX properly.
 * @param value
 * @param info
 * @returns
 */
export function formatNumberOnUserInput(
  value: number | string | undefined,
  info: { userTyping: boolean; input: string }
): string {
  if (info.userTyping) {
    return info.input;
  }
  return numberFormatter(value);
}

/**
 * Number formatter that nicely formats numbers with correct decimal separator based on locale
 * Always uses blank space as thousands separator to prevent confusion with the decimal separator
 * @param value
 * @returns
 */
export function numberFormatter(value: number | string | undefined): string {
  const formattedValue = value
    ? Number(value).toLocaleString(undefined, {
        useGrouping: false, // Disable thousands separator and do it manually instead so it's always spaces
      })
    : "";

  return formatNumberWithSpaceSeparator(formattedValue);
}

/**
 * Number parser that supports both comma and dot as decimal separator
 * @param value
 * @returns
 */
export function numberParser(value: string | undefined): number {
  // Convert comma to dot
  value = value?.replace(",", ".");

  // Remove all non-digit characters
  value = value?.replace(/[^\d.-]/g, "");

  // Parse as float
  return parseFloat(value || "0");
}

/**
 * Number parser that supports both comma and dot as decimal separator
 * Same as numberParser but allows empty values. numberParser will always return a valid number
 * this one returns an empty string if the value is empty
 * @param value
 * @returns
 */
export function numberParserAllowEmpty(value: string | undefined): number | string {
  // Convert comma to dot
  value = value?.replace(",", ".");

  // Remove all non-digit characters
  value = value?.replace(/[^\d.-]/g, "");

  if (value === "" || value === undefined) {
    return "";
  }

  // Parse as float
  return parseFloat(value);
}

/**
 * Enrich text with links
 * @param text
 * @returns
 */
export function enrichText(text: string | undefined) {
  // Regular expression to match URLs
  const urlRegex =
    /(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})/gi;

  // Split the input text by URLs
  const parts = (text ?? "").split(urlRegex);

  // Convert URLs to <a> tags
  const elements = parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a href={part} key={index} target="_blank" rel="noopener noreferrer">
          {part}
        </a>
      );
    } else {
      return <React.Fragment key={index}>{part}</React.Fragment>;
    }
  });

  return <>{elements}</>;
}

/**
 * Formats the weight in grams to either kilograms or grams based on the provided precision.
 *
 * @param {number} weightInGrams - The weight in grams to be formatted.
 * @param {number} [precision=2] - The precision of the formatting (number of decimal places).
 * @return {string} The formatted weight with the appropriate unit (kg or g).
 */
export function formatWeight(weightInGrams: number, precision: number = 2): string {
  if (weightInGrams >= 1000) {
    const kilograms = removeTrailingZeros((weightInGrams / 1000).toFixed(precision));
    return `${kilograms} kg`;
  } else {
    const grams = removeTrailingZeros(weightInGrams.toFixed(precision));
    return `${grams} g`;
  }
}

/**
 * Formats the length in millimeters to either meters or millimeters based on the provided precision.
 *
 * @param {number} lengthInMillimeter - The length in millimeters to be formatted.
 * @param {number} [precision=2] - The precision of the formatting (number of decimal places).
 * @return {string} The formatted length with the appropriate unit (m or mm).
 */
export function formatLength(lengthInMillimeter: number, precision: number = 2): string {
  if (lengthInMillimeter >= 1000) {
    const meters = removeTrailingZeros((lengthInMillimeter / 1000).toFixed(precision));
    return `${meters} m`;
  } else {
    return `${lengthInMillimeter} mm`;
  }
}

/**
 * Removes trailing zeros from a numeric string, including unnecessary decimal points.
 *
 * This function takes a string representation of a number and removes any trailing zeros
 * after the decimal point. If the number ends with a decimal point followed by only zeros,
 * the entire decimal portion is removed.
 *
 * @param num - The numeric string to process.
 * @returns The numeric string with trailing zeros removed.
 *
 * @example
 * ```typescript
 * removeTrailingZeros("123.45000"); // Returns "123.45"
 * removeTrailingZeros("100.000");   // Returns "100"
 * removeTrailingZeros("0.0000");    // Returns "0"
 * ```
 */
function removeTrailingZeros(num: string): string {
  return num.replace(/(\.\d*?[1-9])0+|\.0*$/, "$1");
}
