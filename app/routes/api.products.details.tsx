import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// GraphQL query to get details for multiple nodes (products) by their IDs
const GET_PRODUCTS_BY_IDS_QUERY = `#graphql
  query getProductsByIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        featuredImage {
          url(transform: { maxWidth: 100, maxHeight: 100, preferredContentType: WEBP })
        }
      }
    }
  }
`;

// Type for the expected response data
type ProductNodeDetails = {
  id: string;
  title: string;
  featuredImage?: { url: string };
};

type GraphQLNodesResponse = {
  data?: {
      nodes: (ProductNodeDetails | null)[];
  };
  errors?: any[]; // Define error type more strictly if needed
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids");

  if (!idsParam) {
    return json({ error: "Product IDs are required" }, { status: 400 });
  }

  const ids = idsParam.split(',').filter(id => id.startsWith('gid://shopify/Product/'));

  if (ids.length === 0) {
      return json({ products: [] });
  }

  console.log(`[API /api/products/details] Fetching details for IDs:`, ids);

  try {
    // Call without generic type
    const response = await admin.graphql(
      GET_PRODUCTS_BY_IDS_QUERY,
      { variables: { ids: ids } }
    );

    // Check HTTP status first
    if (!response.ok) {
        let errorDetails = `Request failed with status ${response.status}`;
        try { errorDetails = await response.text(); } catch {}
        console.error(`[API /api/products/details] GraphQL request failed: ${response.status}`, errorDetails);
        return json({ error: "Failed to fetch product details", details: errorDetails }, { status: response.status });
    }

    // Parse JSON and apply type
    const responseJson: GraphQLNodesResponse = await response.json();

    // Check for GraphQL errors in the body
    if (responseJson.errors) {
      console.error("[API /api/products/details] GraphQL errors:", responseJson.errors);
      // Return 200 OK but with error info
      return json({ error: "Failed to fetch product details", details: responseJson.errors }, { status: 200 });
    }

    // Filter out nulls and ensure data.nodes exists
    const products = responseJson.data?.nodes?.filter((node: ProductNodeDetails | null): node is ProductNodeDetails => node !== null) ?? [];

    console.log(`[API /api/products/details] Found details:`, products);

    return json({ products });

  } catch (error: any) {
    console.error("[API /api/products/details] Unexpected error:", error);
    return json({ error: "Failed to fetch product details", details: error.message }, { status: 500 });
  }
}; 