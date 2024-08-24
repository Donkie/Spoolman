import { useEffect } from "react";

/**
 * Renders a favicon element in the head of the HTML document with the specified URL.
 *
 * @param {string} props.url - The URL of the favicon image.
 * @return {JSX.Element} - An empty JSX element.
 */
export function Favicon(props: { url: string }) {
  useEffect(() => {
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (!link) {
      link = document.createElement("link") as HTMLLinkElement;
      link.rel = "icon";
      document.getElementsByTagName("head")[0].appendChild(link);
    }
    link.href = props.url;
  }, [props.url]);
  return <></>;
}
