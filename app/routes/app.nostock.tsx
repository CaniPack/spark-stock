import { ActionFunctionArgs, LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData, useSubmit, useFetcher, Form } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  Autocomplete,
  Icon,
  Spinner,
  Thumbnail,
  Checkbox,
  TextField,
  DatePicker,
  Popover,
  Box,
  InlineStack,
  Banner,
  Frame,
  Toast,
  IndexTable,
  ButtonGroup,
  EmptyState,
} from "@shopify/polaris";
import { SearchIcon, CalendarIcon } from '@shopify/polaris-icons';
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import type { ProductConfiguration } from '@prisma/client';

// Loader: Load existing configs AND pass API key
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  console.log("[Loader app.nostock] Fetching configured product IDs for shop:", session.shop);
  try {
    // Fetch IDs of products that have *any* configuration saved for this shop
    // We could filter by noStockEnabled: true, but fetching all gives flexibility later
    const configuredProducts = await prisma.productConfiguration.findMany({
      where: {
        shop: session.shop,
        // Optionally add: noStockEnabled: true
      },
      select: {
        productId: true, // Select only the product ID
      },
      orderBy: {
        updatedAt: 'desc', // Optional: show recently configured first
      },
      // Optional: Add take/limit for pagination later
    });

    const configuredProductIds = configuredProducts.map(p => p.productId);
    console.log("[Loader app.nostock] Found IDs:", configuredProductIds);

    return json({
        apiKey: process.env.SHOPIFY_API_KEY || "",
        configuredProductIds: configuredProductIds,
    });

  } catch (error: any) {
     console.error("[Loader app.nostock] Error fetching configured IDs:", error);
     // Return empty list on error but still render page
     return json({
        apiKey: process.env.SHOPIFY_API_KEY || "",
        configuredProductIds: [],
        loaderError: error.message || "Failed to load configured products"
     }, { status: 500 });
  }
};

// TODO: Implement action to save configuration
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  const productId = formData.get("productId") as string;
  if (!productId) {
    console.error("Save attempt failed: Missing Product ID");
    return json({ error: "Product ID is required" }, { status: 400 });
  }

  // Helper function to safely parse date or return null
  const parseDate = (dateString: FormDataEntryValue | null): Date | null => {
    if (!dateString || typeof dateString !== 'string') return null;
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? null : date; // Check if date is valid
    } catch {
      return null;
    }
  };

  // Extract and carefully parse form data
  const configData = {
    shop: session.shop,
    productId: productId,
    // Checkbox value is 'on' if checked, null/absent otherwise. Convert to boolean.
    noStockEnabled: formData.get("noStockEnabled") === "on",
    noStockButtonText: formData.get("noStockButtonText") as string || null, // Use null for empty optional strings
    noStockButtonColor: formData.get("noStockButtonColor") as string || null,
    noStockNotifyFormEnabled: formData.get("noStockNotifyFormEnabled") === "on",
    noStockTimerEnabled: formData.get("noStockTimerEnabled") === "on",
    noStockRestockDate: parseDate(formData.get("noStockRestockDate")),
    noStockRecommendationsEnabled: formData.get("noStockRecommendationsEnabled") === "on",
    noStockRecommendedProductGids: formData.get("noStockRecommendedProductGids") as string || null,
  };

  console.log("[Action] Attempting to save config for product:", productId);
  console.log("[Action] Data to save:", JSON.stringify(configData, null, 2)); // Log the exact data

  try {
    const result = await prisma.productConfiguration.upsert({
      where: { shop_productId: { shop: session.shop, productId: productId } },
      update: configData,
      create: configData,
    });
    console.log("[Action] Prisma upsert successful! Result ID:", result.id); // Log success and ID
    return json({ success: true });
  } catch (error: any) {
    console.error("[Action] Prisma upsert failed:", error);
    // Log the specific Prisma error if available
    const errorMessage = error.message || "Failed to save configuration";
    return json({ error: errorMessage }, { status: 500 });
  }
};

// --- Types ---
// Type for data fetched from Autocomplete search API
type FetchedProductOption = {
  value: string; // Product GID (used as value in Autocomplete)
  label: string; // Product Title (used as label in Autocomplete)
  media?: string;
};
// Type for Autocomplete options state (simple value/label)
type ProductOption = {
    value: string;
    label: string;
};
// Type for product details used in the configured list
type ProductDetails = {
    id: string; // Product GID
    title: string;
    featuredImage?: { url: string };
};
// Define ConfigState explicitly with only "No Stock" fields
type ConfigState = {
    noStockEnabled: boolean;
    noStockButtonText: string | null;
    noStockButtonColor: string | null;
    noStockNotifyFormEnabled: boolean;
    noStockTimerEnabled: boolean;
    noStockRestockDate: Date | null;
    noStockRecommendationsEnabled: boolean;
    noStockRecommendedProductGids: string | null;
};
// Type for config fetcher data (can return full Prisma type initially)
type ConfigFetcherData = { config?: ProductConfiguration | null; error?: string; };
// Type for save fetcher data
type SaveFetcherData = { success?: boolean; error?: string; };
// Type for loader data
type LoaderData = {
    apiKey: string;
    configuredProductIds: string[];
    loaderError?: string; // Make error optional
};

// Default state for the configuration form (matching explicit ConfigState)
const defaultConfigState: ConfigState = {
  noStockEnabled: false,
  noStockButtonText: 'Avísame cuando esté disponible',
  noStockButtonColor: '#808080',
  noStockNotifyFormEnabled: true,
  noStockTimerEnabled: false,
  noStockRestockDate: null,
  noStockRecommendationsEnabled: false,
  noStockRecommendedProductGids: null,
};

export default function NoStockSettingsPage() {
  const { apiKey, configuredProductIds, loaderError } = useLoaderData<LoaderData>(); // Use specific LoaderData type

  const submit = useSubmit();
  const productFetcher = useFetcher<{products?: FetchedProductOption[], error?: string}>();
  const configFetcher = useFetcher<ConfigFetcherData>();
  const saveFetcher = useFetcher<SaveFetcherData>();
  const detailsFetcher = useFetcher<{products?: ProductDetails[], error?: string}>();

  // --- State ---
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>();
  // State to hold details (id, title, media) of the currently selected/edited product
  const [selectedProductInfo, setSelectedProductInfo] = useState<ProductDetails | undefined>();
  const [inputValue, setInputValue] = useState('');
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]); // For Autocomplete display {value, label}
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [config, setConfig] = useState<ConfigState>(defaultConfigState);
  const [isConfigLoading, setIsConfigLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isToastError, setIsToastError] = useState(false);
  const [{ month, year }, setDate] = useState({ month: new Date().getMonth(), year: new Date().getFullYear() });
  const [datePickerPopoverActive, setDatePickerPopoverActive] = useState(false);
  const [configuredProductDetails, setConfiguredProductDetails] = useState<ProductDetails[]>([]);
  // -------------

  const handleMonthChange = useCallback(
    (month: number, year: number) => setDate({ month, year }),
    [],
  );

  const toggleDatePickerPopover = useCallback(() => setDatePickerPopoverActive((active) => !active), []);

  const handleDateSelect = useCallback(({ end: selectedDate }: { end: Date }) => {
    setConfig(prev => ({ ...prev, noStockRestockDate: selectedDate }));
    setDatePickerPopoverActive(false);
  }, []);

  // --- Fetch products for autocomplete ---
  const fetchProducts = useCallback((query: string) => {
    if (query.length < 2) { setProductOptions([]); return; }
    setLoadingProducts(true);
    productFetcher.load(`/api/products/search?query=${encodeURIComponent(query)}`);
  }, [productFetcher]);

  // Update Autocomplete options based on productFetcher
  useEffect(() => {
    if (productFetcher.data?.products) {
      const options = productFetcher.data.products.map(p => ({ value: p.value, label: p.label }));
      setProductOptions(options);
      setLoadingProducts(false);
    } else if (productFetcher.data?.error) {
      console.error("Error fetching products:", productFetcher.data.error);
      setLoadingProducts(false);
      setProductOptions([]);
    }
    if (productFetcher.state === 'loading') {
      setLoadingProducts(true);
    } else if (productFetcher.state === 'idle') {
      setLoadingProducts(false);
    }
  }, [productFetcher.state, productFetcher.data]);
  // --------------------------------------

  // --- Handle Autocomplete Input Change ---
  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);
      // Clear selection if input changes manually
      if (selectedProductInfo && selectedProductInfo.title !== value) {
        setSelectedProductId(undefined);
        setSelectedProductInfo(undefined);
      }
      const timerId = setTimeout(() => { fetchProducts(value); }, 300);
      return () => clearTimeout(timerId);
    },
    [fetchProducts, selectedProductInfo]
  );
  // ---------------------------------------

  // --- Handle Autocomplete Selection ---
  const handleSelect = useCallback((selected: string[]) => {
    const selectedValue = selected[0]; // This is the Product GID (value)
    // Find the full data (including media, label) from the fetcher's last results
    const selectedOptData = productFetcher.data?.products?.find(opt => opt.value === selectedValue);

    if (selectedOptData) {
      setSelectedProductId(selectedOptData.value); // GID
      // Map FetchedProductOption to ProductDetails for selectedProductInfo state
      setSelectedProductInfo({
          id: selectedOptData.value,
          title: selectedOptData.label,
          featuredImage: selectedOptData.media ? { url: selectedOptData.media } : undefined
      });
      setInputValue(selectedOptData.label);
      console.log("[Select] Selected Product GID:", selectedOptData.value);
      // Trigger config load
      configFetcher.load(`/api/product/config?productId=${encodeURIComponent(selectedOptData.value)}`);
      setIsConfigLoading(true);
    } else {
       // Fallback if data somehow missing
       setSelectedProductId(selectedValue);
       setSelectedProductInfo({ id: selectedValue, title: selectedValue });
       setInputValue(selectedValue);
       console.warn("[Select] Product data not found in fetcher, using ID");
    }
    setProductOptions([]); // Clear Autocomplete options list
  }, [productFetcher.data?.products, configFetcher]);
  // -------------------------------------

  // --- useEffects for loading/saving config, fetching details ---
  useEffect(() => {
    console.log("[Effect configFetcher] State:", configFetcher.state, "Data:", configFetcher.data);
    if (configFetcher.state === 'idle' && configFetcher.data) {
      setIsConfigLoading(false);
      if (configFetcher.data.config) {
        console.log("[Effect configFetcher] Config loaded from API:", configFetcher.data.config);
        // Map loaded data (full Prisma type) to ConfigState
        const loadedConfig = configFetcher.data.config;
        setConfig({
            noStockEnabled: loadedConfig.noStockEnabled,
            noStockButtonText: loadedConfig.noStockButtonText,
            noStockButtonColor: loadedConfig.noStockButtonColor,
            noStockNotifyFormEnabled: loadedConfig.noStockNotifyFormEnabled,
            noStockTimerEnabled: loadedConfig.noStockTimerEnabled,
            noStockRestockDate: loadedConfig.noStockRestockDate ? new Date(loadedConfig.noStockRestockDate) : null,
            noStockRecommendationsEnabled: loadedConfig.noStockRecommendationsEnabled,
            noStockRecommendedProductGids: loadedConfig.noStockRecommendedProductGids,
        });
      } else if (configFetcher.data.error) {
        console.error("[Effect configFetcher] Error loading config:", configFetcher.data.error);
        setToastMessage(`Error cargando configuración: ${configFetcher.data.error}`);
        setIsToastError(true);
      } else {
        // Config is null (not found), reset to defaults
        console.log("[Effect configFetcher] No config found for product, using defaults.");
        setConfig(defaultConfigState);
      }
    }
    if (configFetcher.state === 'loading') {
      setIsConfigLoading(true);
    }
  }, [configFetcher.state, configFetcher.data]);

  useEffect(() => {
    console.log("[Effect saveFetcher] State:", saveFetcher.state, "Data:", saveFetcher.data);
    if (saveFetcher.state === 'idle' && saveFetcher.data) {
        if (saveFetcher.data.error) {
            setToastMessage(`Error al guardar: ${saveFetcher.data.error}`);
            setIsToastError(true);
        } else if (saveFetcher.data.success) {
            setToastMessage("Configuración guardada con éxito!");
            setIsToastError(false);

            // --- Optimistic Update --- 
            // Check if the product just saved is already in the details list
            if (selectedProductId && selectedProductInfo) {
                const isAlreadyListed = configuredProductDetails.some(p => p.id === selectedProductId);
                if (!isAlreadyListed) {
                    console.log("[Effect saveFetcher] Optimistically adding new product to list:", selectedProductInfo);
                    // Add the newly configured product to the beginning of the list
                    setConfiguredProductDetails(prevDetails => [selectedProductInfo, ...prevDetails]);
                } else {
                    // Optional: Update the existing item in the list if needed, 
                    // though just reloading the page or editing again fetches fresh data.
                    console.log("[Effect saveFetcher] Product already listed, no optimistic update needed.");
                }
            }
            // ------------------------

        }
         // Consider clearing fetcher data? saveFetcher.data = undefined;
    }
  }, [saveFetcher.state, saveFetcher.data, selectedProductId, selectedProductInfo, configuredProductDetails]); // Add dependencies

  useEffect(() => {
    if (configuredProductIds && configuredProductIds.length > 0 && detailsFetcher.state === 'idle' && !detailsFetcher.data) {
        console.log("[Effect Loader] Found configured IDs, fetching details:", configuredProductIds);
        const idsParam = configuredProductIds.join(',');
        detailsFetcher.load(`/api/products/details?ids=${encodeURIComponent(idsParam)}`);
    }
  }, [configuredProductIds, detailsFetcher]);

  useEffect(() => {
    if (detailsFetcher.state === 'idle' && detailsFetcher.data?.products) {
        console.log("[Effect detailsFetcher] Received product details:", detailsFetcher.data.products);
        setConfiguredProductDetails(detailsFetcher.data.products);
    } else if (detailsFetcher.state === 'idle' && detailsFetcher.data?.error) {
        console.error("[Effect detailsFetcher] Error fetching details:", detailsFetcher.data.error);
    }
  }, [detailsFetcher.state, detailsFetcher.data]);

  const handleConfigChange = <T extends keyof ConfigState>(field: T, value: ConfigState[T]) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  // --- Handle Save Button Click ---
  const handleSave = useCallback(() => {
      if (!selectedProductId) return;
      const formData = new FormData();
      formData.append("productId", selectedProductId);
      // Append all config values
      (Object.keys(config) as Array<keyof ConfigState>).forEach(key => {
          const value = config[key];
          if (value !== null && value !== undefined) {
               if (typeof value === 'boolean') {
                   // Send 'on' or effectively nothing for false
                   if (value) formData.append(key, 'on');
               } else if (value instanceof Date) {
                   formData.append(key, value.toISOString());
               } else {
                   formData.append(key, value as string);
               }
          }
      });

      // --- Log FormData before submit ---
      console.log("[Save] Submitting FormData for:", selectedProductId);
      for (let [key, value] of formData.entries()) {
          console.log(`  ${key}: ${value}`);
      }
      // -----------------------------------

      saveFetcher.submit(formData, { method: "post", action: "/app/nostock" });
  }, [selectedProductId, config, saveFetcher]);
  // --------------------------------

  // --- Handle Edit Button Click (from list) ---
  const handleEditClick = useCallback((product: ProductDetails) => {
    setSelectedProductId(product.id);
    setSelectedProductInfo(product); // This is ProductDetails type, matches state
    setInputValue(product.title);
    setProductOptions([]); // Clear any Autocomplete search results
    console.log(`[Edit Click] Editing Product GID: ${product.id}`);
    // Trigger loading the config for this product
    configFetcher.load(`/api/product/config?productId=${encodeURIComponent(product.id)}`);
    setIsConfigLoading(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [configFetcher]);
  // -------------------------------------------

  // Clear Toast message
  const dismissToast = useCallback(() => setToastMessage(null), []);

  const toastMarkup = toastMessage ? (
    <Toast content={toastMessage} error={isToastError} onDismiss={dismissToast} />
  ) : null;

  const textField = (
    <Autocomplete.TextField
      onChange={handleInputChange}
      label="Buscar Producto"
      value={inputValue}
      prefix={<Icon source={SearchIcon} tone="base" />}
      placeholder="Empieza a escribir el nombre del producto..."
      autoComplete="off"
      connectedRight={loadingProducts ? <Spinner size="small" accessibilityLabel="Cargando productos" /> : undefined}
    />
  );

  // Format selected date for display
  const formattedDate = config.noStockRestockDate
    ? config.noStockRestockDate.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  // --- Render Configured Products List ---
  const configuredProductsMarkup = (
    configuredProductDetails.length > 0 ? (
      <Card padding="0">
         <BlockStack gap="400">
            {configuredProductDetails.map((product) => (
                <div key={product.id} style={{ padding: 'var(--p-space-400)', borderBottom: '1px solid var(--p-color-border)' }}>
                    <InlineStack blockAlign="center" align="space-between" wrap={false}>
                         <InlineStack gap="400" blockAlign="center" wrap={false}>
                             <Thumbnail source={product.featuredImage?.url || ''} alt={product.title} size="medium" />
                             <BlockStack gap="100">
                                 <Text variant="bodyMd" fontWeight="semibold" as="p">{product.title}</Text>
                                 <Text variant="bodySm" tone="subdued" as="p">Configuración "Sin Stock" activa.</Text>
                             </BlockStack>
                         </InlineStack>
                         <Button size="slim" onClick={() => handleEditClick(product)}>Editar</Button>
                    </InlineStack>
                </div>            ))}
         </BlockStack>
      </Card>
    ) : (
      detailsFetcher.state === 'loading' ? (
        <Card><BlockStack gap="200" align="center"><Spinner size="small" /><Text variant="bodySm" tone="subdued" as="p">Cargando productos configurados...</Text></BlockStack></Card>
      ) : (
          <EmptyState
            heading="Aún no has configurado ningún producto"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>Usa el buscador de arriba para encontrar y configurar tu primer producto.</p>
          </EmptyState>
      )
    )
  );
  // -------------------------------------

  return (
    <Frame>
      <Page>
        <ui-title-bar title="Configuración Sin Stock / Notificarme">
           <button variant="primary" onClick={handleSave} disabled={saveFetcher.state !== 'idle' || !selectedProductId}>
               {saveFetcher.state !== 'idle' ? 'Guardando...' : 'Guardar'}
           </button>
        </ui-title-bar>
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <Text as="h2" variant="headingMd">
                  Configurar Opciones "Sin Stock"
                </Text>
                <Text as="p" variant="bodyMd">
                  Busca y selecciona un producto para personalizar cómo se muestra cuando está agotado.
                </Text>

                <Autocomplete
                  options={productOptions}
                  selected={selectedProductId ? [selectedProductId] : []}
                  onSelect={handleSelect}
                  loading={loadingProducts}
                  textField={textField}
                  listTitle="Productos Sugeridos"
                />

                {selectedProductInfo && (
                  <BlockStack gap="400">
                    <div style={{ marginTop: '20px', paddingBottom: '20px', borderBottom: '1px solid #dfe3e8' }}>
                      <Text as="h3" variant="headingMd">
                        Configuración para:
                      </Text>
                      <div style={{ display: 'flex', alignItems: 'center', marginTop: '10px' }}>
                         {selectedProductInfo.featuredImage && (
                          <div style={{ marginRight: '12px' }}>
                             <Thumbnail source={selectedProductInfo.featuredImage.url} alt={selectedProductInfo.title} size="medium" />
                           </div>
                         )}
                         <Text variant="bodyLg" as="span" fontWeight="semibold">{selectedProductInfo.title}</Text>
                       </div>
                     </div>

                    {isConfigLoading && <Spinner accessibilityLabel="Cargando configuración" size="large" />}

                    {!isConfigLoading && (
                      <BlockStack gap="400">
                        <Checkbox
                          label='Activar personalización "Sin Stock" para este producto'
                          checked={config.noStockEnabled}
                          onChange={(checked: boolean) => handleConfigChange('noStockEnabled', checked)}
                          name="noStockEnabled"
                        />
                        {config.noStockEnabled && (
                          <BlockStack gap="400">
                            <TextField
                              label="Texto del botón (ej: Avísame, Sin stock)"
                              value={config.noStockButtonText ?? ''}
                              onChange={(value) => handleConfigChange('noStockButtonText', value)}
                              autoComplete="off"
                              name="noStockButtonText"
                            />
                            <TextField
                              label="Color del botón (código Hex, ej: #808080)"
                              value={config.noStockButtonColor ?? ''}
                              onChange={(value) => handleConfigChange('noStockButtonColor', value)}
                              autoComplete="off"
                              name="noStockButtonColor"
                              helpText="Introduce un color hexadecimal válido (ej. #FF0000 para rojo)."
                            />
                            <Checkbox
                              label="Incluir formulario 'Avísame cuando haya stock'"
                              checked={config.noStockNotifyFormEnabled}
                              onChange={(checked: boolean) => handleConfigChange('noStockNotifyFormEnabled', checked)}
                              name="noStockNotifyFormEnabled"
                            />
                            <Checkbox
                              label="Mostrar temporizador de reposición estimada"
                              checked={config.noStockTimerEnabled}
                              onChange={(checked: boolean) => handleConfigChange('noStockTimerEnabled', checked)}
                              name="noStockTimerEnabled"
                            />
                            {config.noStockTimerEnabled && (
                              <div>
                                <Popover
                                  active={datePickerPopoverActive}
                                  activator={(
                                    <TextField
                                      label="Fecha estimada de reposición"
                                      value={formattedDate}
                                      prefix={<Icon source={CalendarIcon} />}
                                      autoComplete="off"
                                      onFocus={toggleDatePickerPopover}
                                      readOnly
                                      name="noStockRestockDateDisplay"
                                    />
                                  )}
                                  autofocusTarget="none"
                                  onClose={toggleDatePickerPopover}
                                >
                                  <DatePicker
                                    month={month}
                                    year={year}
                                    onChange={handleDateSelect}
                                    onMonthChange={handleMonthChange}
                                    selected={config.noStockRestockDate || undefined}
                                    disableDatesBefore={new Date()}
                                  />
                                </Popover>
                                <input type="hidden" name="noStockRestockDate" value={config.noStockRestockDate?.toISOString() ?? ''} />
                              </div>
                            )}
                            <Checkbox
                              label="Mostrar productos recomendados alternativos"
                              checked={config.noStockRecommendationsEnabled}
                              onChange={(checked: boolean) => handleConfigChange('noStockRecommendationsEnabled', checked)}
                              name="noStockRecommendationsEnabled"
                            />
                            {config.noStockRecommendationsEnabled && (
                              <TextField
                                label="IDs de productos recomendados (separados por coma)"
                                value={config.noStockRecommendedProductGids ?? ''}
                                onChange={(value) => handleConfigChange('noStockRecommendedProductGids', value)}
                                autoComplete="off"
                                name="noStockRecommendedProductGids"
                                helpText="Pega los GIDs completos (ej: gid://shopify/Product/123,gid://shopify/Product/456). Para obtenerlos, puedes usar la URL del admin o herramientas de desarrollador."
                                multiline={2}
                              />
                            )}
                          </BlockStack>
                        )}
                      </BlockStack>
                    )}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Section for Listing Configured Products */}          <Layout.Section>
             <BlockStack gap="500">
                 <Text variant="headingMd" as="h2">Productos Configurados</Text>
                 {configuredProductsMarkup}
             </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>
      {toastMarkup}
    </Frame>
  );
} 