
const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "app", "routes", "app.cart-history.tsx");
if (!fs.existsSync(file)) {
  console.error("Missing file:", file);
  process.exit(1);
}

let src = fs.readFileSync(file, "utf8");

// Ensure pagination state exists.
if (!src.includes("const pageSize = 50;")) {
  src = src.replace(
    /const \[query, setQuery\] = useState\(""\);/,
    `const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;`
  );
}

// Ensure paginatedRows calculation exists.
if (!src.includes("const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));")) {
  src = src.replace(
    /\}, \[query, rows\]\);\s*\n\s*const getFormAction = `\$\{location\.pathname\}`;/,
    `}, [query, rows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const getFormAction = \`\${location.pathname}\`;`
  );
}

// Replace the broken search/list Card with a clean valid version.
// This starts at the Card that contains the search input and ends before the final closing BlockStack.
const startMarker = `      <Card>
        <BlockStack gap="300">
          <input`;
const start = src.indexOf(startMarker);

const endMarker = `      </Card>
    </BlockStack>`;
const end = src.lastIndexOf(endMarker);

if (start === -1 || end === -1 || end <= start) {
  console.error("Could not locate the Cart History list Card to repair.");
  console.error("Please send app/routes/app.cart-history.tsx if this fails.");
  process.exit(1);
}

const replacement = `      <Card>
        <BlockStack gap="300">
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setPage(1);
            }}
            placeholder="Search customer name, SKU, product name, email..."
            style={{ width: "100%", padding: "12px 14px", border: "1px solid #9ca3af", borderRadius: 10, fontSize: 14 }}
          />

          {filteredRows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "42px 16px" }}>
              <Text as="h2" variant="headingMd">No matching cart records</Text>
              <Text as="p" tone="subdued">Try a different search term or increase the date range.</Text>
            </div>
          ) : (
            <div>
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 1220 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.4fr) 110px 130px 170px 130px 170px 120px", gap: 16, padding: "12px 14px", background: "#f8fafc", borderBottom: "1px solid #e5e7eb", fontWeight: 750, color: "#374151" }}>
                    <div>Customer</div>
                    <div>Items</div>
                    <div>Cart total</div>
                    <div>Cart date</div>
                    <div>Orders</div>
                    <div>Last order</div>
                    <div style={{ textAlign: "right" }}>Status</div>
                  </div>
                  {paginatedRows.map((row) => (
                    <CartRow key={\`\${row.source}-\${row.id}\`} row={row} formAction={formAction} />
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14 }}>
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  style={{
                    border: "1px solid #d1d5db",
                    background: safePage <= 1 ? "#f3f4f6" : "#fff",
                    color: safePage <= 1 ? "#9ca3af" : "#111827",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontWeight: 700,
                    cursor: safePage <= 1 ? "not-allowed" : "pointer",
                  }}
                >
                  Previous
                </button>

                <Text as="p" tone="subdued">
                  Page {safePage} of {totalPages} · Showing {paginatedRows.length} of {filteredRows.length}
                </Text>

                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  style={{
                    border: "1px solid #d1d5db",
                    background: safePage >= totalPages ? "#f3f4f6" : "#fff",
                    color: safePage >= totalPages ? "#9ca3af" : "#111827",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontWeight: 700,
                    cursor: safePage >= totalPages ? "not-allowed" : "pointer",
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </BlockStack>
      </Card>
`;

src = src.slice(0, start) + replacement + src.slice(end + "      </Card>\n".length);

fs.writeFileSync(file, src, "utf8");
console.log("Repaired Cart History JSX list/pagination block:", file);
