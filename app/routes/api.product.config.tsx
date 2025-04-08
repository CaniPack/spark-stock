import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");

  if (!productId) {
    return json({ error: "Product ID is required" }, { status: 400 });
  }

  console.log(`[API /api/product/config] Fetching config for Product ID: ${productId} Shop: ${session.shop}`);

  try {
    const config = await prisma.productConfiguration.findUnique({
      where: {
        shop_productId: {
          shop: session.shop,
          productId: productId,
        },
      },
    });

    console.log(`[API /api/product/config] Found config:`, config);

    // Return the found config (which might be null if none exists)
    return json({ config });

  } catch (error: any) {
    console.error("[API /api/product/config] Error fetching configuration:", error);
    return json({ error: "Failed to fetch configuration", details: error.message }, { status: 500 });
  }
}; 