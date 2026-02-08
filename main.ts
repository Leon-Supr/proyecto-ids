const { readTextFile, readDir, writeTextFile } = Deno;

const logFile = "al_2875403.txt";

try {
  const programStart = performance.now();
  await writeTextFile(logFile, "Log de tiempos de apertura\n\n");

  for await (const entry of readDir("./Files")) {
    if (entry.isFile && entry.name.endsWith(".html")) {
      try {
        const start = performance.now();
        await readTextFile(`./Files/${entry.name}`);
        const end = performance.now();

        const time = (end - start).toFixed(4);
        const line = `${entry.name} -> ${time} ms\n`;
        await writeTextFile(logFile, line, { append: true });
      } catch (err: any) {
        const errorLine = `Error leyendo ${entry.name}: ${err.message}\n`;
        await writeTextFile(logFile, errorLine, { append: true });
      }
    }
  }

  const programEnd = performance.now();
  const totalTime = (programEnd - programStart).toFixed(4);
  const totalTimeLine = `Tiempo total de programa: ${totalTime} ms`;
  await writeTextFile(logFile, totalTimeLine, { append: true });
} catch (globalError: any) {
  console.error("ERROR CRÍTICO:", globalError.message);
}
