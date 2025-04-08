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
} from "@shopify/polaris";
import { SearchIcon, CalendarIcon } from '@shopify/polaris-icons';
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import type { ProductConfiguration } from '@prisma/client';

// TODO: Implement loader to fetch existing configuration
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  // In a real scenario, fetch existing settings for products if needed
  return json({ message: "Sin Stock Configuration Page" });
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

// Type for data fetched from API
type FetchedProductOption = {
  value: string; // Product GID
  label: string; // Product Title
  media?: string;
};

// Type for Autocomplete options (simple string label)
type ProductOption = {
    value: string;
    label: string;
};

// Type for configuration state
type ConfigState = Omit<ProductConfiguration, 'id' | 'shop' | 'productId' | 'createdAt' | 'updatedAt' | 'preorderEnabled' | 'preorderButtonText' | 'preorderButtonColor' | 'preorderEndDate' | 'preorderPaymentType' | 'preorderPartialPaymentValue' | 'preorderTerms' | 'preorderTermsDisplay' | 'warrantyEnabledOverride' | 'warrantyPresentationOverride' | 'warrantyPriceType' | 'warrantyPriceValue' | 'warrantyVariantId'>;

// Default state for the configuration form
const defaultConfigState: ConfigState = {
  noStockEnabled: false,
  noStockButtonText: 'Avísame cuando esté disponible',
  noStockButtonColor: '#808080', // Default Grey
  noStockNotifyFormEnabled: true,
  noStockTimerEnabled: false,
  noStockRestockDate: null,
  noStockRecommendationsEnabled: false,
  noStockRecommendedProductGids: null,
};

// Type for config fetcher data
type ConfigFetcherData = {
  config?: ProductConfiguration | null;
  error?: string;
};

// Type for save fetcher data
type SaveFetcherData = {
    success?: boolean;
    error?: string;
};

export default function NoStockSettingsPage() {
  const submit = useSubmit();
  const productFetcher = useFetcher<{products?: FetchedProductOption[], error?: string}>();
  const configFetcher = useFetcher<ConfigFetcherData>();
  const saveFetcher = useFetcher<SaveFetcherData>();

  // --- Autocomplete State ---
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>();
  const [selectedProductInfo, setSelectedProductInfo] = useState<FetchedProductOption | undefined>();
  const [inputValue, setInputValue] = useState('');
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  // -------------------------

  // --- Configuration Form State ---
  const [config, setConfig] = useState<ConfigState>(defaultConfigState);
  const [isConfigLoading, setIsConfigLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // ------------------------------

  // --- Date Picker State ---
  const [{ month, year }, setDate] = useState({ month: new Date().getMonth(), year: new Date().getFullYear() });
  const [datePickerPopoverActive, setDatePickerPopoverActive] = useState(false);

  const handleMonthChange = useCallback(
    (month: number, year: number) => setDate({ month, year }),
    [],
  );

  const toggleDatePickerPopover = useCallback(() => setDatePickerPopoverActive((active) => !active), []);

  const handleDateSelect = useCallback(({ end: selectedDate }: { end: Date }) => {
    setConfig(prev => ({ ...prev, noStockRestockDate: selectedDate }));
    setDatePickerPopoverActive(false);
  }, []);
  // ------------------------

  // --- Toast State ---
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isToastError, setIsToastError] = useState(false);
  // -------------------

  const fetchProducts = useCallback((query: string) => {
    if (query.length < 2) {
      setProductOptions([]);
      return;
    }
    setLoadingProducts(true);
    productFetcher.load(`/api/products/search?query=${encodeURIComponent(query)}`);
  }, [productFetcher]);

  useEffect(() => {
    if (productFetcher.data?.products) {
      // Map fetched data to simple {value, label} format
      const optionsForAutocomplete = productFetcher.data.products.map((product) => ({
        value: product.value,
        label: product.label,
      }));
      setProductOptions(optionsForAutocomplete);
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
  }, [productFetcher.data, productFetcher.state]);

  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);
      // Clear selection if input changes manually after selection
      if (selectedProductInfo && selectedProductInfo.label !== value) {
        setSelectedProductId(undefined);
        setSelectedProductInfo(undefined);
      }
      const timerId = setTimeout(() => {
        fetchProducts(value);
      }, 300);
      return () => clearTimeout(timerId);
    },
    [fetchProducts, selectedProductInfo]
  );

  const handleSelect = useCallback((selected: string[]) => {
    const selectedValue = selected[0];
    const selectedOptData = productFetcher.data?.products?.find(opt => opt.value === selectedValue);

    if (selectedOptData) {
      setSelectedProductId(selectedOptData.value);
      setSelectedProductInfo(selectedOptData);
      setInputValue(selectedOptData.label);
      console.log("[Select] Selected Product GID:", selectedOptData.value);

      // --- Load existing configuration using configFetcher ---
      console.log(`[Select] Triggering load for config of ${selectedOptData.value}`);
      configFetcher.load(`/api/product/config?productId=${encodeURIComponent(selectedOptData.value)}`);
      setIsConfigLoading(true); // Set loading true when fetch starts
      // Config state will be updated by the useEffect watching configFetcher
      // -----------------------------------------------------

    } else {
       setSelectedProductId(selectedValue);
       setSelectedProductInfo({value: selectedValue, label: selectedValue});
       setInputValue(selectedValue);
    }
    setProductOptions([]);
  }, [productFetcher.data?.products, configFetcher]);

  // --- useEffect to update form when config is loaded ---
  useEffect(() => {
    console.log("[Effect configFetcher] State:", configFetcher.state, "Data:", configFetcher.data);
    if (configFetcher.state === 'idle' && configFetcher.data) {
      setIsConfigLoading(false);
      if (configFetcher.data.config) {
        console.log("[Effect configFetcher] Config loaded from API:", configFetcher.data.config);
        // Update state, ensuring Date objects are handled correctly
        const loadedConfig = configFetcher.data.config;
        setConfig({
            noStockEnabled: loadedConfig.noStockEnabled,
            noStockButtonText: loadedConfig.noStockButtonText,
            noStockButtonColor: loadedConfig.noStockButtonColor,
            noStockNotifyFormEnabled: loadedConfig.noStockNotifyFormEnabled,
            noStockTimerEnabled: loadedConfig.noStockTimerEnabled,
            // Convert string date back to Date object if it exists
            noStockRestockDate: loadedConfig.noStockRestockDate ? new Date(loadedConfig.noStockRestockDate) : null,
            noStockRecommendationsEnabled: loadedConfig.noStockRecommendationsEnabled,
            noStockRecommendedProductGids: loadedConfig.noStockRecommendedProductGids,
        });
      } else if (configFetcher.data.error) {
        console.error("[Effect configFetcher] Error loading config:", configFetcher.data.error);
        setToastMessage(`Error cargando configuración: ${configFetcher.data.error}`);
        setIsToastError(true);
        // Reset form to defaults if loading failed?
        // setConfig({ ... default values ... });
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
  // ------------------------------------------------------

  const handleConfigChange = <T extends keyof ConfigState>(field: T, value: ConfigState[T]) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  // Handle form submission using saveFetcher
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
    console.log("[Save] Submitting FormData:");
    for (let [key, value] of formData.entries()) {
        console.log(`  ${key}: ${value}`);
    }
    // -----------------------------------

    saveFetcher.submit(formData, { method: "post", action: "/app/nostock" }); // Use saveFetcher
  }, [selectedProductId, config, saveFetcher]);

  // Show Toast feedback from saveFetcher submission
  useEffect(() => {
      console.log("[Effect saveFetcher] State:", saveFetcher.state, "Data:", saveFetcher.data);
      if (saveFetcher.state === 'idle' && saveFetcher.data) {
          if (saveFetcher.data.error) {
              setToastMessage(`Error al guardar: ${saveFetcher.data.error}`);
              setIsToastError(true);
          } else if (saveFetcher.data.success) {
              setToastMessage("Configuración guardada con éxito!");
              setIsToastError(false);
          }
           // Clear fetcher data after processing to prevent re-showing toast on navigation
           // saveFetcher.data = undefined; // This might cause issues, test carefully
      }
  }, [saveFetcher.state, saveFetcher.data]);

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
                         {selectedProductInfo.media && (
                          <div style={{ marginRight: '12px' }}>
                             <Thumbnail source={selectedProductInfo.media} alt="" size="medium" />
                           </div>
                         )}
                         <Text variant="bodyLg" as="span" fontWeight="semibold">{selectedProductInfo.label}</Text>
                       </div>
                     </div>

                    {isConfigLoading && <Spinner accessibilityLabel="Cargando configuración" size="large" />}
                    {saveError && (
                      <Banner title="Error al guardar" tone="critical" onDismiss={() => setSaveError(null)}>
                        <p>{saveError}</p>
                      </Banner>
                    )}

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
        </Layout>
      </Page>
      {toastMarkup}
    </Frame>
  );
} 