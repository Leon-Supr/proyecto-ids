const { readTextFile, readDir, writeTextFile } = Deno;
const logFile6 = "a6_leo.txt"; // CountedPerFile

const wordCounterTable = async () => {
  const globalStats = new Map<
    string,
    { totalCount: number; fileCount: number }
  >();

  for await (const entry of readDir("./FilesSortedWords")) {
    if (entry.isFile && entry.name.endsWith(".txt")) {
      try {
        const fileContent = await readTextFile(
          `./FilesSortedWords/${entry.name}`,
        );

        const words = fileContent
          .split("\n") //Las separa por línea
          .map((w) => w.toLowerCase());// Hacerla minúscula cada palabra

        const uniqueWords = new Set(words); // Eliminar duplicados

        //Conteo de palabras global
        for (const word of words) {
          if (globalStats.has(word)) {
            const currentCount = globalStats.get(word)!;
            globalStats.set(word, {
              totalCount: currentCount.totalCount + 1,
              fileCount: currentCount.fileCount,
            });
          } else {
            globalStats.set(word, {
              totalCount: 1,
              fileCount: 0, // todavía no se ha tomado en cuenta el archivo
            });
          }
        }

        //Conteo de palabras por archivo
        for (const word of uniqueWords) {
          if (globalStats.has(word)) {
            const currentCount = globalStats.get(word)!;
            globalStats.set(word, {
              totalCount: currentCount.totalCount,
              fileCount: currentCount.fileCount + 1,
            });
          }
        }
      } catch (error: any) {
        throw new Error(`Error procesando ${entry.name}: ${error.message}`);
      }
    }
  }

  const outputContent = [...globalStats.entries()]
    .map(([word, { totalCount, fileCount }]) =>
      `${word} -> ${totalCount} times across ${fileCount} files`
    )
    .join("\n");

  await writeTextFile(logFile6, outputContent);
};

await wordCounterTable();
export default wordCounterTable;
