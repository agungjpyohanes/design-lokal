export function serveStatic(app: Express | any) {
  const possiblePaths = [
    path.resolve(import.meta.dirname, "public"),
    path.resolve(import.meta.dirname, "../public"),
    path.resolve(import.meta.dirname, "../../dist/public"),
    path.resolve(process.cwd(), "dist/public"),
    path.resolve(process.cwd(), "public")
  ];

  let distPath = possiblePaths.find((p) => fs.existsSync(p));

  if (!distPath) {
    console.error(`Could not find the build directory in any of:`, possiblePaths);
    distPath = possiblePaths[0];
  }

  (app as any).use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  (app as any).use("*", (_req: any, res: any) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}