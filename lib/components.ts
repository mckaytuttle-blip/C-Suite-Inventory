// Reference list of Stat Medical's tracked hardware components — the same ~83-item
// universe used by the ROP/ROQ model, minus items that are drop-shipped or fully
// retired (Stat never holds meaningful stock for those, so an "in-stock rate" is
// meaningless). Matching against Zoho is done by exact `name` (case/whitespace
// normalized) since not every item has a SKU populated.
//
// To add/remove a tracked component, edit this list and redeploy — there's no
// separate config file to keep in sync for this dashboard.

export type Tier = "A" | "B" | "C";

export interface TrackedComponent {
  name: string;
  tier: Tier;
}

export const TRACKED_COMPONENTS: TrackedComponent[] = [
  { name: "Stat Tag Shoulder Pads", tier: "A" },
  { name: "Stat Tag Screws", tier: "A" },
  { name: "Stat Tag PCB (2.0)", tier: "A" },
  { name: "Stat Tag White Case 2.0 (Ribbed)", tier: "A" },
  { name: "Stat Tag Batteries", tier: "A" },
  { name: "Sensor Tablet PCB", tier: "A" },
  { name: "Tablet (unprogrammed)", tier: "A" },
  { name: "Sensor Desktop & Ceiling PCB", tier: "A" },
  { name: "Consolidated Sensor PCB", tier: "A" },
  { name: "Sensor Micro USB Splitter", tier: "A" },
  { name: "Gateway PCB", tier: "A" },
  { name: "Badge Screws", tier: "B" },
  { name: "Sensor Lenses", tier: "B" },
  { name: "Stat Tag Badge Straps", tier: "B" },
  { name: "Sensor Ceiling Screws", tier: "B" },
  { name: "Sensor Plugin PCB", tier: "B" },
  { name: "Badge PCB", tier: "B" },
  { name: "Sensor Ceiling Springs", tier: "B" },
  { name: "Badge Safety Button", tier: "B" },
  { name: "Sensor Ceiling Metal Plate", tier: "B" },
  { name: "Sensor Ceiling Case", tier: "B" },
  { name: "Badge Alligator Clips", tier: "B" },
  { name: "Tablet USB Plug", tier: "B" },
  { name: "Patch Cable 1 FT Orange", tier: "B" },
  { name: "Self-Adhesive Clear Rubber Feet", tier: "B" },
  { name: "Badge Mini Battery", tier: "B" },
  { name: "Dot Stickers (Box of 1,000)", tier: "B" },
  { name: "USB Wall Plug", tier: "B" },
  { name: "Badge Clip PCB", tier: "B" },
  { name: "Badge Full Size Battery", tier: "B" },
  { name: "Badge Reel", tier: "B" },
  { name: "Sensor Desktop Micro USB Cable", tier: "B" },
  { name: "Sensor Ceiling USB Cable 20'", tier: "B" },
  { name: "Badge Clip Batteries", tier: "B" },
  { name: "FS Unburned Box", tier: "B" },
  { name: "Tablet Counter Stand", tier: "B" },
  { name: "FS POE Splitter", tier: "B" },
  { name: "FS Barrel to USB C Splitter", tier: "B" },
  { name: "Gateway Helical Antenna", tier: "B" },
  { name: "FS Wireless Keyboard Mouse Combo", tier: "B" },
  { name: "FS HDMI Cable", tier: "B" },
  { name: "FS Remote Holders", tier: "B" },
  { name: "FS HDMI Dust Cover", tier: "B" },
  { name: "Badge Clip Rings", tier: "B" },
  { name: "FS 2ft Black Patch Cables", tier: "B" },
  { name: "Gateway Type C USB Cable, 6 inch (White)", tier: "B" },
  { name: "FS ULINE Slider Zip Bags", tier: "B" },
  { name: "Aruba SG2505P Router", tier: "B" },
  { name: "Call Box", tier: "B" },
  { name: "Infrared Receivers (TSOP53356)", tier: "C" },
  { name: "Sensor Plugin Case", tier: "C" },
  { name: "Case Badge Mini", tier: "C" },
  { name: "Badge Safety Charging Cable", tier: "C" },
  { name: "Case Badge Full Size", tier: "C" },
  { name: "Badge Clip Cases", tier: "C" },
  { name: "Badge Clip Buttons", tier: "C" },
  { name: "Call Pull Cord PCB", tier: "C" },
  { name: "Badge Velcro Straps", tier: "C" },
  { name: "Call Keystone Jacks Black", tier: "C" },
  { name: "Badge Clip Charging Cable", tier: "C" },
  { name: "Call Pull Cord Outlet", tier: "C" },
  { name: "Patch Cable 2 ft Orange", tier: "C" },
  { name: "Tablet Power Cord", tier: "C" },
  { name: "Patch Cable 3 ft Orange", tier: "C" },
  { name: "Patch Cable 5 ft Orange", tier: "C" },
  { name: "Switch Copper SFP Module", tier: "C" },
  { name: "Call Emergency Box PCB", tier: "C" },
  { name: "Call Box 6 Port Panel", tier: "C" },
  { name: "Tool Level", tier: "C" },
  { name: "Tool Hole Saw", tier: "C" },
  { name: "FS SD Cards", tier: "C" },
  { name: "Call USB C POE Splitter", tier: "C" },
  { name: "Call Keystone Jacks Orange", tier: "C" },
  { name: "Call Box Blank Panel", tier: "C" },
  { name: "Sensor Desktop Mount", tier: "C" },
  { name: "Patch Cable 6 inch Orange", tier: "C" },
  { name: "Call Wall Plate", tier: "C" },
  { name: "Call Emergency Wall Button PCB", tier: "C" },
  { name: "Call Emergency Button Wall", tier: "C" },
  { name: "Call Button Long Cable", tier: "C" },
  { name: "Sensor Desktop Case", tier: "C" },
  { name: "RFM69HCW-915 Transceiver", tier: "C" },
  { name: "Gateway Plastic Case", tier: "C" },
];

/** Normalize a Zoho item name for matching (case/whitespace/punctuation tolerant). */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const NORMALIZED_TRACKED = new Map(
  TRACKED_COMPONENTS.map((c) => [normalizeName(c.name), c])
);

export function findTrackedComponent(zohoName: string): TrackedComponent | undefined {
  return NORMALIZED_TRACKED.get(normalizeName(zohoName));
}
