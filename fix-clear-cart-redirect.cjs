
const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "app", "routes", "app.cart-history.tsx");

if (!fs.existsSync(file)) {
  console.error("Missing file:", file);
  process.exit(1);
}

let src = fs.readFileSync(file, "utf8");

// 1) Ensure redirect is imported from @remix-run/node.
src = src.replace(
  /import\s*\{\s*json\s*\}\s*from\s*"@remix-run\/node";/,
  `import { json, redirect } from "@remix-run/node";`
);

src = src.replace(
  /import\s*\{([^}]*?)\}\s*from\s*"@remix-run\/node";/,
  (match, imports) => {
    const parts = imports.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.includes("json") && !parts.includes("redirect")) {
      parts.push("redirect");
      return `import { ${parts.join(", ")} } from "@remix-run/node";`;
    }
    return match;
  }
);

// 2) In action, read returnTo from formData.
if (!src.includes('const returnTo = String(formData.get("returnTo")')) {
  src = src.replace(
    /const source = String\(formData\.get\("source"\) \|\| ""\);/,
    `const source = String(formData.get("source") || "");
  const returnTo = String(formData.get("returnTo") || "/app/cart-history");`
  );
}

// 3) Clear cart action should redirect back instead of returning JSON.
// Replace the success json block inside clearCart branch.
src = src.replace(
  /return json<ActionData>\(\{\s*ok:\s*true,\s*message:\s*result\.count > 0 \? "Cart was cleared from active history\." : "Cart was already cleared or not found\.",\s*\}\);/s,
  `return redirect(returnTo);`
);

// Fallback for shorter variations.
src = src.replace(
  /return json<ActionData>\(\{\s*ok:\s*true,\s*message:\s*"Cart was cleared from active history\."\s*\}\);/g,
  `return redirect(returnTo);`
);

// 4) Add returnTo hidden input to Clear cart form.
if (!src.includes('name="returnTo" value={')) {
  src = src.replace(
    /<input type="hidden" name="source" value=\{row\.source\} \/>\s*<button\s+type="submit"/,
    `<input type="hidden" name="source" value={row.source} />
                <input type="hidden" name="returnTo" value={typeof window !== "undefined" ? window.location.pathname + window.location.search : "/app/cart-history"} />
                <button
                  type="submit"`
  );
}

// 5) If the above inserted client-side window in JSX and TypeScript complains in SSR, replace with safer prop approach.
// Add currentPath prop to CartRow if this file has a CartRow component with props.
if (!src.includes("currentPath: string")) {
  src = src.replace(
    /function CartRow\(\{ row \}: \{ row: Row \}\)/,
    `function CartRow({ row, currentPath }: { row: Row; currentPath: string })`
  );
  src = src.replace(
    /function CartRow\(\{ row, formAction \}: \{ row: Row; formAction: string \}\)/,
    `function CartRow({ row, formAction, currentPath }: { row: Row; formAction: string; currentPath: string })`
  );
}

// Replace window hidden input with currentPath if present.
src = src.replace(
  /<input type="hidden" name="returnTo" value=\{typeof window !== "undefined" \? window\.location\.pathname \+ window\.location\.search : "\/app\/cart-history"\} \/>/g,
  `<input type="hidden" name="returnTo" value={currentPath} />`
);

// Make sure row render passes currentPath.
if (src.includes("function CartRow({ row, currentPath }") || src.includes("currentPath }: { row: Row")) {
  src = src.replace(
    /<CartRow key=\{`\$\{row\.source\}-\$\{row\.id\}`\} row=\{row\} \/>/g,
    `<CartRow key={\`\${row.source}-\${row.id}\`} row={row} currentPath={currentPath} />`
  );
  src = src.replace(
    /<CartRow key=\{`\$\{row\.source\}-\$\{row\.id\}`\} row=\{row\} formAction=\{formAction\} \/>/g,
    `<CartRow key={\`\${row.source}-\${row.id}\`} row={row} formAction={formAction} currentPath={currentPath} />`
  );
}

// Add currentPath const in page component.
if (!src.includes("const currentPath = `${location.pathname}${location.search}`;")) {
  src = src.replace(
    /const location = useLocation\(\);/,
    `const location = useLocation();
  const currentPath = \`\${location.pathname}\${location.search}\`;`
  );
}

fs.writeFileSync(file, src, "utf8");
console.log("Patched Clear cart redirect behavior:", file);
