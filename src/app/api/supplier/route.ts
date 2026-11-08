import { NextResponse } from "next/server";
import { guardRoute } from "@/lib/auth";
import { getSettings, getSupplierCosts, getSupplierImports, saveSupplierImport, type SupplierImport } from "@/lib/store";
import { learnCosts, parseSupplierFile } from "@/lib/supplier";

export const dynamic = "force-dynamic";

const MAX = 15 * 1024 * 1024;

/** Import history and how many orders have an exact supplier cost. */
export async function GET(req: Request) {
  const denied = await guardRoute(req);
  if (denied) return denied;
  const [imports, costs, settings] = await Promise.all([getSupplierImports(), getSupplierCosts(), getSettings()]);
  return NextResponse.json({ imports, orders: Object.keys(costs).length, model: settings.supplierModel ?? null });
}

/** multipart/form-data with `file` (.xls or .csv exported from Wiio). */
export async function POST(req: Request) {
  const denied = await guardRoute(req);
  if (denied) return denied;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Envie o arquivo da Wiio (.xls ou .csv)." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Arquivo maior que 15 MB." }, { status: 400 });
  if (!/\.(xls|csv)$/i.test(file.name)) {
    return NextResponse.json(
      { error: "Formato não suportado. Use o .xls exportado pela Wiio, ou salve como .csv." },
      { status: 400 },
    );
  }

  let parsed;
  try {
    parsed = parseSupplierFile(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (e) {
    return NextResponse.json({ error: `Não consegui ler a planilha: ${(e as Error).message}` }, { status: 400 });
  }

  const before = await getSettings();
  const changes: { item: string; from: number | null; to: number }[] = [];
  for (const [p, v] of Object.entries(parsed.table.productCosts)) {
    const old = before.productCosts?.[p];
    if (old !== v) changes.push({ item: p, from: old ?? null, to: v });
  }
  if (before.shippingFirstItem !== parsed.table.shippingFirstItem) {
    changes.push({ item: "Frete: primeiro item", from: before.shippingFirstItem || null, to: parsed.table.shippingFirstItem });
  }
  if (before.shippingExtraItem !== parsed.table.shippingExtraItem) {
    changes.push({ item: "Frete: item adicional", from: before.shippingExtraItem || null, to: parsed.table.shippingExtraItem });
  }

  const count = Object.keys(parsed.orders).length;
  const today = new Date().toISOString().slice(0, 10);
  const dates = Object.values(parsed.orders)
    .map((o) => o.date)
    .filter((d): d is string => !!d && d <= today)
    .sort();
  const info: SupplierImport = { at: new Date().toISOString(), file: file.name, orders: count, from: dates[0], to: dates[dates.length - 1] };
  // Saving relearns the cost table from every upload; the dashboard, Tráfego and Criativos recompute on their
  // next load (their caches are keyed on the supplier model).
  const model = await saveSupplierImport(parsed.orders, info, parsed.table, (all) => learnCosts(all));
  return NextResponse.json({
    orders: count,
    from: info.from,
    to: info.to,
    newOrders: info.newOrders,
    updatedOrders: info.updatedOrders,
    model: model ?? null,
    rows: parsed.rows,
    table: parsed.table,
    changes,
    unresolved: parsed.unresolved,
    settings: await getSettings(),
  });
}
