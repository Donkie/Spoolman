import { ISpool } from "../pages/spools/model";

export type QRExportOptions = {
    boxSize?: number;
    padding?: number;
    useFullURL?: boolean;
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

            setTimeout(() => {
                URL.revokeObjectURL(url);
            });
        });
    }
};

export const transformSpoolToQRContent = (spool: ISpool, useFullURL?: boolean) => {
    let content = `web+spoolman:s-${spool.id}`;

    // Explicitly check for true, as undefined is a valid value.
    if (useFullURL === true) {
      content = `${window.location.origin}/spool/show/${spool.id}`;
    }

    return {
      data: content,
      title: `QR-Spool: ${spool.id}`,
    };
  }