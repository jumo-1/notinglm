import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["vscode"],
  outfile: "dist/extension.js",
  sourcemap: true,
});

console.log("vscode-extension bundled -> dist/extension.js");
