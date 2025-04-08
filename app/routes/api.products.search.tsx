import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { cors } from "remix-utils/cors";

// --- GraphQL Types (Simplified) ---
type GraphQLError = {
  message: string;
  locations?: { line: number; column: number }[];
  path?: string[];
  extensions?: Record<string, any>;
};

type ProductNode = {
  id: string;
  title: string;
  featuredImage?: { url: string };
};

type ProductEdge = {
  node: ProductNode;
};

type ProductsData = {
  products: {
    edges: ProductEdge[];
  };
};

type GraphQLResponse<T> = {
  data?: T;
  errors?: GraphQLError[];
  extensions?: Record<string, any>;
};
// ---------------------------------

// GraphQL query to search for products by title
const SEARCH_PRODUCTS_QUERY = `#graphql
  query searchProducts($query: String!) {
    products(first: 10, query: $query) {
      edges {
        node {
          id
          title
          featuredImage {
             url
          }
        }
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const query = url.searchParams.get("query");

  if (!query) {
    // Apply CORS even for bad requests
    return cors(request, json({ products: [] }, { status: 400 }), { origin: origin || "*" });
  }

  try {
    const { admin } = await authenticate.admin(request);

    // Call graphql without the generic type argument here
    const response = await admin.graphql(
      SEARCH_PRODUCTS_QUERY,
      {
        variables: { query: `title:*${query}*` },
      }
    );

    // Check if the response status itself is not ok (e.g., network issue, authentication failure)
    if (!response.ok) {
      console.error("GraphQL request failed with status:", response.status);
      // Attempt to read body for more details if possible, but might fail
      let errorDetails = `Request failed with status ${response.status}`;
      try {
        errorDetails = await response.text();
      } catch {}
      return cors(request, json({ error: "Failed to fetch products", details: errorDetails }, { status: response.status }), { origin: origin || "*" });
    }

    // Now parse the JSON and apply the explicit type
    const responseJson: GraphQLResponse<ProductsData> = await response.json();

    // Check for GraphQL errors in the parsed JSON body
    if (responseJson.errors) {
      console.error("GraphQL Error:", responseJson.errors);
      // Return 200 OK status but with error information in the body, or 500 if preferred
      return cors(request, json({ error: "Failed to fetch products", details: responseJson.errors }, { status: 200 }), { origin: origin || "*" });
    }

    // Check if data is missing
    if (!responseJson.data) {
       console.error("GraphQL Error: No data returned");
       return cors(request, json({ error: "Failed to fetch products", details: "No data returned" }, { status: 200 }), { origin: origin || "*" });
    }

    // Format results
    const products = responseJson.data.products.edges.map((edge: ProductEdge) => ({
      value: edge.node.id,
      label: edge.node.title,
      media: edge.node.featuredImage?.url
    }));

    return cors(request, json({ products }), { origin: origin || "*" });

  } catch (error: any) { // Catch potential errors during auth or other steps
    console.error("Product search error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return cors(request, json({ error: errorMessage }, { status: 500 }), { origin: origin || "*" });
  }
}; 