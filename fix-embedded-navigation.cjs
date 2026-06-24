const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}
function write(file, text) {
  fs.writeFileSync(file, text, 'utf8');
  console.log('updated', file);
}
function exists(file) {
  return fs.existsSync(file);
}

const root = process.cwd();
const appTsx = path.join(root, 'app', 'routes', 'app.tsx');
const indexTsx = path.join(root, 'app', 'routes', '_index.tsx');
const authLoginTsx = path.join(root, 'app', 'routes', 'auth.login.tsx');

if (!exists(appTsx)) {
  console.error('Missing app/routes/app.tsx. Run this from the project root.');
  process.exit(1);
}

let app = read(appTsx);

// Ensure useLocation import exists.
app = app.replace(/from "@remix-run\/react";/, (m) => {
  const lineStart = app.slice(0, app.indexOf(m)).lastIndexOf('\n') + 1;
  const importLine = app.slice(lineStart, app.indexOf(m) + m.length);
  if (importLine.includes('useLocation')) return m;
  return m.replace('}', ', useLocation }');
});

// If the import uses multiple names and our simple replace didn't catch it, patch common patterns.
app = app.replace(/import \{ ([^}]*?) \} from "@remix-run\/react";/, (full, names) => {
  if (names.split(',').map(s => s.trim()).includes('useLocation')) return full;
  return `import { ${names}, useLocation } from "@remix-run/react";`;
});

// Insert helper inside default component after function line.
if (!app.includes('const embeddedSearch = location.search || "";')) {
  app = app.replace(/export default function ([^(]+)\(\) \{\s*/, (m) => {
    return `${m}\n  const location = useLocation();\n  const embeddedSearch = location.search || "";\n  const embeddedUrl = (path: string) => `${path}${embeddedSearch}`;\n`;
  });
}

// Replace common static menu URLs with embeddedUrl calls.
app = app.replace(/url=\{"\/app"\}/g, 'url={embeddedUrl("/app")}');
app = app.replace(/url="\/app"/g, 'url={embeddedUrl("/app")}');
app = app.replace(/url=\{"\/app\/cart-history"\}/g, 'url={embeddedUrl("/app/cart-history")}');
app = app.replace(/url="\/app\/cart-history"/g, 'url={embeddedUrl("/app/cart-history")}');
app = app.replace(/url=\{"\/app\/settings"\}/g, 'url={embeddedUrl("/app/settings")}');
app = app.replace(/url="\/app\/settings"/g, 'url={embeddedUrl("/app/settings")}');

app = app.replace(/href=\{"\/app"\}/g, 'href={embeddedUrl("/app")}');
app = app.replace(/href="\/app"/g, 'href={embeddedUrl("/app")}');
app = app.replace(/href=\{"\/app\/cart-history"\}/g, 'href={embeddedUrl("/app/cart-history")}');
app = app.replace(/href="\/app\/cart-history"/g, 'href={embeddedUrl("/app/cart-history")}');
app = app.replace(/href=\{"\/app\/settings"\}/g, 'href={embeddedUrl("/app/settings")}');
app = app.replace(/href="\/app\/settings"/g, 'href={embeddedUrl("/app/settings")}');

// Replace common Polaris button url strings.
app = app.replace(/\{ label: "Dashboard", url: "\/app" \}/g, '{ label: "Dashboard", url: embeddedUrl("/app") }');
app = app.replace(/\{ label: "Cart History", url: "\/app\/cart-history" \}/g, '{ label: "Cart History", url: embeddedUrl("/app/cart-history") }');
app = app.replace(/\{ label: "Cart history", url: "\/app\/cart-history" \}/g, '{ label: "Cart history", url: embeddedUrl("/app/cart-history") }');
app = app.replace(/\{ label: "Settings", url: "\/app\/settings" \}/g, '{ label: "Settings", url: embeddedUrl("/app/settings") }');

write(appTsx, app);

if (exists(indexTsx)) {
  let idx = read(indexTsx);
  idx = idx.replace(/return redirect\(`\/app\$\{url\.search\}`\);/g, 'return redirect(`/app${url.search}`);');
  if (!idx.includes('return redirect(`/app${url.search}`);')) {
    idx = `import type { LoaderFunctionArgs } from "@remix-run/node";\nimport { redirect } from "@remix-run/node";\n\nexport async function loader({ request }: LoaderFunctionArgs) {\n  const url = new URL(request.url);\n  return redirect(\`/app\${url.search}\`);\n}\n\nexport default function Index() {\n  return null;\n}\n`;
  }
  write(indexTsx, idx);
}

if (exists(authLoginTsx)) {
  let auth = read(authLoginTsx);
  // Make auth.login less likely to render raw/JSON inside embedded Admin when shop is missing.
  if (!auth.includes('Please reopen One Cart Reminder from Shopify Admin')) {
    auth = auth.replace(/Missing shop parameter\. Please open this app from Shopify Admin Apps\./g, 'Please reopen One Cart Reminder from Shopify Admin Apps. Shopify did not include a shop parameter for this request.');
  }
  write(authLoginTsx, auth);
}

console.log('\nDone. Now run:');
console.log('npm run typecheck');
console.log('npm run build');
