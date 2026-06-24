
const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "app", "routes", "app.cart-history.tsx");
if (!fs.existsSync(file)) {
  console.error("Missing file:", file);
  process.exit(1);
}

let src = fs.readFileSync(file, "utf8");

if (!src.includes("useLocation")) {
  src = src.replace(
    /import\s*\{([^}]+)\}\s*from\s*"@remix-run\/react";/,
    (m, imports) => {
      const parts = imports.split(",").map((s) => s.trim()).filter(Boolean);
      if (!parts.includes("useLocation")) parts.push("useLocation");
      return `import { ${parts.join(", ")} } from "@remix-run/react";`;
    }
  );
}

src = src.replace(
  /function CartRow\(\{\s*row\s*\}:\s*\{\s*row:\s*Row\s*\}\)\s*\{/,
  'function CartRow({ row, formAction }: { row: Row; formAction: string }) {'
);

src = src.replace(
  /<Form method="post">\s*<input type="hidden" name="actionType" value="createDraft" \/>\s*<input type="hidden" name="id" value=\{row\.id\} \/>\s*<input type="hidden" name="source" value=\{row\.source\} \/>\s*<Button submit variant="primary">Create draft order<\/Button>\s*<\/Form>/g,
  `<Form method="post" action={formAction} reloadDocument>
              <input type="hidden" name="actionType" value="createDraft" />
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="source" value={row.source} />
              <button
                type="submit"
                style={{
                  border: "1px solid #202223",
                  background: "#202223",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Create draft order
              </button>
            </Form>`
);

src = src.replace(
  /const actionData = useActionData<typeof action>\(\) as ActionData \| undefined;\s*const location = useLocation\(\);\s*const preservedParams/,
  `const actionData = useActionData<typeof action>() as ActionData | undefined;
  const location = useLocation();
  const formAction = \`\${location.pathname}\${location.search}\`;
  const preservedParams`
);

if (!src.includes("const formAction =")) {
  src = src.replace(
    /const actionData = useActionData<typeof action>\(\) as ActionData \| undefined;/,
    `const actionData = useActionData<typeof action>() as ActionData | undefined;
  const location = useLocation();
  const formAction = \`\${location.pathname}\${location.search}\`;`
  );
}

src = src.replace(
  /<CartRow key=\{\`\$\{row\.source\}-\$\{row\.id\}\`\} row=\{row\} \/>/g,
  '<CartRow key={`${row.source}-${row.id}`} row={row} formAction={formAction} />'
);

src = src.replace(
  /message: errors\.map\(\(error: any\) => error\.message\)\.join\("; "\),/g,
  `message: errors.map((error: any) => error.message).join("; ") || "Draft order could not be created. Please check write_draft_orders permission.",`
);

fs.writeFileSync(file, src, "utf8");
console.log("Patched draft order submit behavior:", file);
