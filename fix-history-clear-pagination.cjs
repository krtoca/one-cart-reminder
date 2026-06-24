
const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "app", "routes", "app.cart-history.tsx");
if (!fs.existsSync(file)) {
  console.error("Missing file:", file);
  process.exit(1);
}

let src = fs.readFileSync(file, "utf8");

// 1) Add clear cart action branch after unsupported action check block.
// This safely lets admin clear stale logged-in carts already stuck in history.
if (!src.includes('actionType === "clearCart"')) {
  src = src.replace(
    /if\s*\(actionType !== "createDraft"\)\s*\{\s*return json<ActionData>\(\{ ok: false, message: "Unsupported action\." \}, \{ status: 400 \}\);\s*\}/,
    `if (actionType === "clearCart") {
    if (source !== "Logged-in cart") {
      return json<ActionData>({ ok: false, message: "Only logged-in carts can be cleared manually." }, { status: 400 });
    }

    const result = await prisma.customerCart.updateMany({
      where: {
        shop: session.shop,
        id,
        orderedAt: null,
      },
      data: {
        itemCount: 0,
        subtotal: null,
        lineItems: [],
        orderedAt: new Date(),
        lastCapturedAt: new Date(),
      },
    });

    return json<ActionData>({
      ok: true,
      message: result.count > 0 ? "Cart was cleared from active history." : "Cart was already cleared or not found.",
    });
  }

  if (actionType !== "createDraft") {
    return json<ActionData>({ ok: false, message: "Unsupported action." }, { status: 400 });
  }`
  );
}

// 2) Add Clear cart button in expanded row for logged-in carts.
if (!src.includes('name="actionType" value="clearCart"')) {
  src = src.replace(
    /<\/Form>\s*\{row\.source === "Abandoned checkout" && row\.url \? \(/,
    `</Form>
            {row.source === "Logged-in cart" ? (
              <Form method="post" action={formAction} reloadDocument>
                <input type="hidden" name="actionType" value="clearCart" />
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="source" value={row.source} />
                <button
                  type="submit"
                  style={{
                    border: "1px solid #d1d5db",
                    background: "#fff",
                    color: "#374151",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                  onClick={(event) => {
                    if (!window.confirm("Clear this cart from active history?")) event.preventDefault();
                  }}
                >
                  Clear cart
                </button>
              </Form>
            ) : null}
            {row.source === "Abandoned checkout" && row.url ? (`
  );
}

// 3) Add pagination state after query state.
if (!src.includes("const pageSize = 50;")) {
  src = src.replace(
    /const \[query, setQuery\] = useState\(""\);/,
    `const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;`
  );
}

// 4) Reset page when search changes.
src = src.replace(
  /onChange=\{\(event\) => setQuery\(event\.currentTarget\.value\)\}/,
  `onChange={(event) => {
              setQuery(event.currentTarget.value);
              setPage(1);
            }}`
);

// 5) Add paginatedRows calculation after filteredRows useMemo block.
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

// 6) Replace rows map with paginated rows map.
src = src.replace(
  /\{filteredRows\.map\(\(row\) => <CartRow key=\{`\$\{row\.source\}-\$\{row\.id\}`\} row=\{row\} formAction=\{formAction\} \/>\)\}/,
  `{paginatedRows.map((row) => <CartRow key={\`\${row.source}-\${row.id}\`} row={row} formAction={formAction} />)}`
);

// 7) Add pagination controls after the rows list container.
if (!src.includes("Page {safePage} of {totalPages}")) {
  src = src.replace(
    /<\/div>\s*<\/div>\s*\)\}\s*<\/BlockStack>\s*<\/Card>/,
    `</div>
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
      </Card>`
  );
}

fs.writeFileSync(file, src, "utf8");
console.log("Patched Cart History clear button and pagination:", file);
