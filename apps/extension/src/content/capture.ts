/**
 * Content script — injected into Shopify pages.
 *
 * Listens for capture requests from the background worker and
 * extracts page data for analysis.
 */

// Listen for messages from background/popup
// eslint-disable-next-line @typescript-eslint/no-deprecated
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if ((message as { type?: string }).type === 'CAPTURE_PAGE') {
    const info = extractPageInfo();
    sendResponse(info);
    return false;
  }
  return false;
});

interface PageExtract {
  url: string;
  title: string;
  description: string;
  hasProductGrid: boolean;
  productCount: number;
  metaTags: { name: string; content: string }[];
}

const extractPageInfo = (): PageExtract => {
  const description =
    document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
  const metaTags = Array.from(document.querySelectorAll('meta[name], meta[property]')).map((m) => ({
    name: m.getAttribute('name') ?? m.getAttribute('property') ?? '',
    content: m.getAttribute('content') ?? '',
  }));

  // Count visible product elements (common Shopify selectors)
  const selectors = [
    '[data-product-id]',
    '.product-item',
    '.grid-product',
    '.product-card',
    '[class*="product-item"]',
  ];
  let productCount = 0;
  for (const sel of selectors) {
    const count = document.querySelectorAll(sel).length;
    if (count > 0) {
      productCount = count;
      break;
    }
  }

  return {
    url: window.location.href,
    title: document.title,
    description,
    hasProductGrid: productCount > 0,
    productCount,
    metaTags: metaTags.slice(0, 30),
  };
};
