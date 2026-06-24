
const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "app", "routes", "app.cart-history.tsx");

if (!fs.existsSync(file)) {
  console.error("Missing file:", file);
  process.exit(1);
}

let src = fs.readFileSync(file, "utf8");

// Hide the secondary source/cart id line if it exists under the customer cell.
src = src.replace(
  /\s*<div[^>]*>\s*\{row\.source[^}]*\}[\s\S]*?\{row\.sourceId[^}]*\}[\s\S]*?<\/div>/g,
  ""
);

// Hide compact item preview line shown under each row.
// This targets common generated snippets that join visibleItems / previewItems / itemPreview.
src = src.replace(
  /\s*<div[^>]*>\s*\{(?:visibleItems|previewItems|itemPreview|previewText)[\s\S]*?<\/div>/g,
  ""
);

// Hide line like: items.map(...).join(" · ") that appears below the row.
src = src.replace(
  /\s*<p[^>]*>\s*\{[^}]*items[^}]*\.map[\s\S]*?\.join\([^)]*\)[\s\S]*?\}[\s\S]*?<\/p>/g,
  ""
);

// Hide "+ more" preview text lines if they were rendered as standalone div/p.
src = src.replace(
  /\s*<(?:div|p)[^>]*>\s*\{\s*row\.items\.length\s*>\s*\d+[\s\S]*?\}\s*<\/(?:div|p)>/g,
  ""
);

// Add a CSS safety net to keep the main table compact even if preview markup changes later.
const cssMarker = "/* CR_COMPACT_HISTORY_LIST_FIX */";
const css = `
${cssMarker}
<style>
  .cart-history-table tbody tr > td .cart-source-line,
  .cart-history-table tbody tr > td .cart-item-preview,
  .cart-history-table tbody tr > td .cart-preview-line,
  .cart-history-table tbody tr > td .muted-preview,
  .cart-history-table tbody tr > td [data-cart-preview="true"],
  .cart-history-table tbody tr > td [data-cart-source="true"] {
    display: none !important;
  }
</style>
`;

if (!src.includes(cssMarker)) {
  // Insert the CSS near the beginning of the default component render if possible.
  src = src.replace(
    /(return\s*\(\s*<>)/,
    `$1\n      ${css}`
  );

  if (!src.includes(cssMarker)) {
    src = src.replace(
      /(return\s*\()/,
      `$1\n      <>\n      ${css}`
    );
    // If we opened a fragment with this fallback, try to close before the matching end of component is too risky.
    // So only use fallback when a fragment return was found above. If not, append harmlessly as a const.
    if (!src.includes(cssMarker)) {
      src = css + "\n" + src;
    }
  }
}

fs.writeFileSync(file, src, "utf8");
console.log("Updated compact Cart History list:", file);
