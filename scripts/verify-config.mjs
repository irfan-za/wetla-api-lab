import { createBuilder } from "vite";

const root = process.env.CONFIG_ROOT ?? process.cwd();
// Resolve actual production plugin configuration, without bundling on the low-RAM host.
const builder = await createBuilder({ root, logLevel: "warn" });
console.log(`Production config resolved: ${root}`);
console.log(`Environments: ${Object.keys(builder.environments).join(", ")}`);
