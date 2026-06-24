
const fs = require("fs");
const path = require("path");

const appFile = path.join(process.cwd(), "app", "routes", "app.tsx");
if (!fs.existsSync(appFile)) {
  console.error("Missing file:", appFile);
  process.exit(1);
}

let src = fs.readFileSync(appFile, "utf8");

// Dashboard should no longer point to /app because /app redirects to cart history.
// It should point to the dedicated dashboard route.
src = src.replace(
  /\{\s*label:\s*"Dashboard",\s*path:\s*"\/app",\s*url:\s*embeddedUrl\("\/app"\)\s*\}/g,
  '{ label: "Dashboard", path: "/app/dashboard", url: embeddedUrl("/app/dashboard") }'
);

src = src.replace(
  /\{\s*label:\s*"Dashboard",\s*url:\s*embeddedUrl\("\/app"\)\s*\}/g,
  '{ label: "Dashboard", path: "/app/dashboard", url: embeddedUrl("/app/dashboard") }'
);

// If nav items were written with url only and no path, keep a compatible active path.
src = src.replace(
  /label:\s*"Dashboard",\s*url:\s*"\/app"/g,
  'label: "Dashboard", path: "/app/dashboard", url: "/app/dashboard"'
);

fs.writeFileSync(appFile, src, "utf8");
console.log("Updated Dashboard navigation to /app/dashboard:", appFile);
