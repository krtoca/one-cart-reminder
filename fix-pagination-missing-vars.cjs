
const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "app", "routes", "app.cart-history.tsx");

if (!fs.existsSync(file)) {
  console.error("Missing file:", file);
  process.exit(1);
}

let src = fs.readFileSync(file, "utf8");

// Ensure page state exists.
if (!src.includes("const [page, setPage] = useState(1);")) {
  src = src.replace(
    /const \[query, setQuery\] = useState\(""\);/,
    `const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);`
  );
}

// Ensure pageSize exists.
if (!src.includes("const pageSize = 50;")) {
  src = src.replace(
    /const \[page, setPage\] = useState\(1\);/,
    `const [page, setPage] = useState(1);
  const pageSize = 50;`
  );
}

// Add missing pagination calculations immediately before the return statement in CartHistoryPage.
if (!src.includes("const paginatedRows = filteredRows.slice")) {
  src = src.replace(
    /\n\s*return \(\s*\n\s*<BlockStack gap="500">/,
    `

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <BlockStack gap="500">`
  );
}

// Current CartRow type only accepts { row: Row }, so remove bad formAction prop.
src = src.replace(
  /<CartRow key=\{`\$\{row\.source\}-\$\{row\.id\}`\} row=\{row\} formAction=\{formAction\} \/>/g,
  `<CartRow key={\`\${row.source}-\${row.id}\`} row={row} />`
);

// If there is a typed callback issue, make row type explicit.
src = src.replace(
  /paginatedRows\.map\(\(row\) => \(/g,
  `paginatedRows.map((row: Row) => (`
);

// If the previous script introduced an unused formAction const, remove it.
src = src.replace(
  /\n\s*const formAction = `\$\{location\.pathname\}\$\{location\.search\}`;/g,
  ""
);
src = src.replace(
  /\n\s*const formAction = `\$\{location\.pathname\}`;/g,
  ""
);

// Ensure search resets page on change.
src = src.replace(
  /onChange=\{\(event\) => setQuery\(event\.currentTarget\.value\)\}/g,
  `onChange={(event) => {
              setQuery(event.currentTarget.value);
              setPage(1);
            }}`
);

fs.writeFileSync(file, src, "utf8");
console.log("Fixed missing pagination variables and CartRow props:", file);
