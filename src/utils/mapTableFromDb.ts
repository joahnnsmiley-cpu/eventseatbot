export function mapTableFromDb(raw: any) {
  return {
    ...raw,

    // positioning
    centerX: raw.centerX ?? raw.center_x ?? raw.x ?? 0,
    centerY: raw.centerY ?? raw.center_y ?? raw.y ?? 0,

    // geometry
    widthPercent: raw.widthPercent ?? raw.width_percent ?? null,
    heightPercent: raw.heightPercent ?? raw.height_percent ?? null,
    sizePercent: raw.sizePercent ?? raw.size_percent ?? null,

    // rotation
    rotationDeg: raw.rotationDeg ?? raw.rotation_deg ?? 0,
  };
}
