// Composite bill-of-materials flattening — shared by any KPI that needs to attribute
// a sale of an assembled product down to the leaf components that went into it
// (Aging/Dead Stock "last movement" and Inventory Turnover's COGS both need this).
//
// Mirrors the approach in the stat-rop-roq-model skill: some composites are built
// from other composites (e.g. "Sensor Desktop (with cord & plug)" is built from the
// "Sensor Desktop" composite, which is itself built from leaf parts), so flattening
// has to recurse until only non-composite (leaf) item_ids remain, multiplying ratios
// down the chain. Results are memoized since several composites share sub-assemblies.
import {
  fetchAllCompositeItems,
  fetchCompositeItemDetail,
  mapWithConcurrency,
  ZohoCompositeItem,
} from "./zoho";

/** Leaf item_id -> quantity of that leaf consumed per one unit of the composite. */
export type LeafQuantities = Map<string, number>;

export interface FlattenedBom {
  /** All composites in the org, keyed by composite_item_id (== item_id in Zoho). */
  composites: Map<string, ZohoCompositeItem>;
  /** Fully flattened leaf quantities per composite_item_id. */
  leafQuantitiesByComposite: Map<string, LeafQuantities>;
}

/**
 * Fetch every composite's BOM and flatten recursively down to leaf item_ids.
 * Concurrency-limited (6 workers) since this is one detail call per composite.
 */
export async function buildFlattenedBoms(): Promise<FlattenedBom> {
  const compositeItems = await fetchAllCompositeItems();
  const composites = new Map(compositeItems.map((c) => [c.composite_item_id, c]));

  const rawMappedItems = new Map<string, { item_id: string; quantity: number }[]>();
  await mapWithConcurrency(compositeItems, 6, async (c) => {
    try {
      const detail = await fetchCompositeItemDetail(c.composite_item_id);
      rawMappedItems.set(
        c.composite_item_id,
        detail.mappedItems.map((m) => ({ item_id: m.item_id, quantity: m.quantity }))
      );
    } catch {
      // If a single composite's BOM fails to load, treat it as having no mapped
      // items rather than failing the whole rolldown — its sales just won't
      // attribute to any leaf component, which is safer than throwing away every
      // other composite's data too.
      rawMappedItems.set(c.composite_item_id, []);
    }
  });

  const memo = new Map<string, LeafQuantities>();

  function flatten(compositeItemId: string, visiting: Set<string>): LeafQuantities {
    const cached = memo.get(compositeItemId);
    if (cached) return cached;

    const result: LeafQuantities = new Map();
    if (visiting.has(compositeItemId)) {
      // Defensive: a cyclic BOM should never happen in Zoho, but don't infinite-loop
      // if data is ever malformed — just stop recursing here.
      return result;
    }
    visiting.add(compositeItemId);

    const mapped = rawMappedItems.get(compositeItemId) ?? [];
    for (const line of mapped) {
      if (composites.has(line.item_id)) {
        // Sub-assembly — recurse and multiply its leaf quantities by this line's qty.
        const subLeaves = flatten(line.item_id, visiting);
        for (const [leafId, qtyPerSub] of subLeaves) {
          result.set(leafId, (result.get(leafId) ?? 0) + qtyPerSub * line.quantity);
        }
      } else {
        // Already a leaf part.
        result.set(line.item_id, (result.get(line.item_id) ?? 0) + line.quantity);
      }
    }

    visiting.delete(compositeItemId);
    memo.set(compositeItemId, result);
    return result;
  }

  const leafQuantitiesByComposite = new Map<string, LeafQuantities>();
  for (const compositeItemId of composites.keys()) {
    leafQuantitiesByComposite.set(compositeItemId, flatten(compositeItemId, new Set()));
  }

  return { composites, leafQuantitiesByComposite };
}
