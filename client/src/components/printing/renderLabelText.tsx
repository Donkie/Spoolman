import {ISpool} from "../../pages/spools/model";

function format_id(id: number) {
    return id ? "#"+id : id
}

function format_weight(weight: number) {
    return weight ? weight.toLocaleString(undefined, { maximumFractionDigits: 2 })+" g" : weight
}

function format_temp(temp: number) {
    return temp ? temp+"°C" : temp
}

function format_price(price: number) {
    return price ? "$"+price : price
}

function format_density(density: number) {
    return density ? density+" g/cm³" : density
}

function format_diameter(diameter: number) {
    return diameter ? diameter+" mm" : diameter
}

const RenderLabelTemplate = (spool: ISpool, template: string) => {
	console.log(spool.id);
    const placeholder_map = {
        "id": format_id(spool?.id as number),
        "vendor": spool?.filament?.vendor?.name,
        "name": spool?.filament?.name,
        "material": spool?.filament?.material,
        "spool_weight": format_weight(spool?.filament?.spool_weight as number),
        "lot_nr": spool?.lot_nr,
        "spool_comment": spool?.comment,
        "filament_comment": spool?.filament?.comment,
        "vendor_comment": spool?.filament?.vendor?.comment,
        "extruder_temp": format_temp(spool?.filament?.settings_extruder_temp as number),
        "bed_temp": format_temp(spool?.filament?.settings_bed_temp as number),
        "first_used": spool?.first_used,
        "price": format_price(spool?.price as number),
        "remaining_weight": format_weight(spool?.remaining_weight as number),
        "used_weight": spool?.used_weight,
        "density": format_density(spool?.filament?.density as number),
        "diameter": format_diameter(spool?.filament?.diameter as number),
        "net_weight": format_weight(spool?.filament?.weight as number),
        "color_hex": spool?.filament?.color_hex,
    }

    let label_text = template;
	console.log("template: ");
	console.log(template);
    let matches = [...template.matchAll(/{(.*?){(.*?)}(.*?)}/gs)];
    // console.log(matches)
    matches.forEach((match) => {
        let substitution = placeholder_map[match[2] as any]
        if (substitution == null) {
            label_text = label_text.replace(match[0], "");
        } else {
            label_text = label_text.replace(match[0], match[1] + substitution + match[3]);
        }
    });
    label_text = label_text.replace(/^\s*\n/gm, "");
    label_text = label_text.replace(/\n/gm, "<br>");
    console.log(label_text)
    return label_text
}

const test_spool = {
    "id": 6,
    "lot_nr": 5,
    "first_used": "2024/02/13",
    "filament": {
        "material": "PLA",
        "name": "Black",
        "spool_weight": 100,
        "settings_extruder_temp": 190,
        "settings_bed_temp": null,
        "vendor": {
            "name": "X3D",
            "comment": "",
        }
    }
}

export default RenderLabelTemplate;