import React from "react";

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
