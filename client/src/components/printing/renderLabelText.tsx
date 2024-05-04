import { ISpool } from "../../pages/spools/model";
import { getCurrencySymbol } from "../../utils/settings";
import dayjs from "dayjs";

function format_id(id: number) {
    return "#" + id;
}

function format_weight(weight: number | undefined): string | undefined {
    if (weight == null) {
        return undefined;
    }
    return weight.toLocaleString(undefined, { maximumFractionDigits: 2 }) + " g";
}

function format_temp(temp: number | undefined): string | undefined {
    if (temp == null) {
        return undefined;
    }
    return temp.toLocaleString(undefined, { maximumFractionDigits: 0 }) + "°C";
}

function format_price(price: number | undefined, currency: string): string | undefined {
    if (price == null) {
        return undefined;
    }
    return getCurrencySymbol(undefined, currency) + price.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function format_density(density: number): string {
    return density.toLocaleString(undefined, { maximumFractionDigits: 2 }) + " g/cm³";
}

function format_diameter(diameter: number): string {
    return diameter.toLocaleString(undefined, { maximumFractionDigits: 2 }) + " mm";
}

function format_date(date: string | undefined): string | undefined {
    if (date == null) {
        return undefined;
    }
    return dayjs.utc(date).local().format("YYYY-MM-DD");
}

function escape_regex(string: string): string {
    return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, "\\$&");
}

function parse_markdown(text: string): string {
    const markdown_map = {
        "**": ["<b>", "</b>"],
        "*": ["<i>", "</i>"],
        "__": ["<u>", "</u>"],
        "~~": ["<s>", "</s>"]
    };
    Object.keys(markdown_map).forEach(key => {
        const re = new RegExp(escape_regex(key), "gs");
        let matches = [...text.matchAll(re)];
        // console.log(matches)
        let opener = true;
        matches.forEach((match) => {
            let substitution = markdown_map[match[0] as keyof typeof markdown_map];
            if (opener) {
                text = text.replace(match[0], substitution[0]);
            } else {
                text = text.replace(match[0], substitution[1]);
            }
            opener = !opener;
        });
    });
    return text;
}

const RenderLabelTemplate = (spool: ISpool, template: string, currency: string) => {
    console.log(spool.id);
    const placeholder_map = {
        "id": format_id(spool?.id),
        "vendor": spool?.filament?.vendor?.name,
        "name": spool?.filament?.name,
        "material": spool?.filament?.material,
        "spool_weight": format_weight(spool?.filament?.spool_weight),
        "lot_nr": spool?.lot_nr,
        "spool_comment": spool?.comment,
        "filament_comment": spool?.filament?.comment,
        "vendor_comment": spool?.filament?.vendor?.comment,
        "extruder_temp": format_temp(spool?.filament?.settings_extruder_temp),
        "bed_temp": format_temp(spool?.filament?.settings_bed_temp),
        "first_used": format_date(spool?.first_used),
        "price": format_price(spool?.price ? spool?.price : spool?.filament?.price, currency),
        "remaining_weight": format_weight(spool?.remaining_weight),
        "used_weight": spool?.used_weight,
        "density": format_density(spool?.filament?.density),
        "diameter": format_diameter(spool?.filament?.diameter),
        "net_weight": format_weight(spool?.filament?.weight),
        "color_hex": spool?.filament?.color_hex
    };

    let label_text = template;
    console.log("template: ");
    console.log(template);
    let matches = [...template.matchAll(/{(.*?){(.*?)}(.*?)}/gs)];
    // console.log(matches)
    matches.forEach((match) =>
    {
        const placeholder = match[2];
        let substitution = null
        if (placeholder.toUpperCase().startsWith("SE_")) {
            const extra_name = placeholder.substring(3);
            substitution = spool?.extra[extra_name];
        }
        else if (placeholder.toUpperCase().startsWith("FE_")) {
            const extra_name = placeholder.substring(3);
            substitution = spool?.filament?.extra[extra_name];
        }
        else if (placeholder.toUpperCase().startsWith("VE_")) {
            const extra_name = placeholder.substring(3);
            substitution = spool?.filament?.vendor?.extra[extra_name];
        }
        else {
            substitution = placeholder_map[placeholder as keyof typeof placeholder_map];
        }
        if (substitution == null) {
            label_text = label_text.replace(match[0], "");
        } else {
            label_text = label_text.replace(match[0], match[1] + substitution + match[3]);
        }
    });
    label_text = label_text.replace(/<[^>]*>/gm, "");
    label_text = label_text.replace(/^\s*\n/gm, "");
    label_text = label_text.replace(/\n/gm, "<br>");
    label_text = parse_markdown(label_text);
    // label_text = label_text.replace(/\*\*/gm, "<b>");
    // label_text = label_text.replace(/\*/gm, "<i>");
    // label_text = label_text.replace(/__/gm, "<u>");
    // label_text = label_text.replace(/ ~~/gm, "<s>");
    console.log(label_text);
    return label_text;
};

// const test_spool = {
//     "id": 6,
//     "lot_nr": 5,
//     "first_used": "2024/02/13",
//     "filament": {
//         "material": "PLA",
//         "name": "Black",
//         "spool_weight": 100,
//         "settings_extruder_temp": 190,
//         "settings_bed_temp": null,
//         "vendor": {
//             "name": "X3D",
//             "comment": ""
//         }
//     }
// };

export default RenderLabelTemplate;
