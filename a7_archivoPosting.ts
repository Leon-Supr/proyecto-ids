const { readTextFile, readDir, writeTextFile } = Deno;

const dictionaryFile = "./a7_archivoPostingFiles/a7_dictionary.md";
const postingFile = "./a7_archivoPostingFiles/a7_posting.txt";

const wordCounterTable = async () => {
  // Map: token -> Map<filename, frequency>
  const globalStats = new Map<string, Map<string, number>>();

  for await (const entry of readDir("./FilesSortedWords")) {
    if (entry.isFile && entry.name.endsWith(".txt")) {
      try {
        const fileContent = await readTextFile(
          `./FilesSortedWords/${entry.name}`,
        );

        const words = fileContent
          .split("\n")
          .map((w) => w.trim().toLowerCase())
          .filter((w) => w.length > 0);

        // Track frequency per file per token
        for (const word of words) {
          if (!globalStats.has(word)) {
            globalStats.set(word, new Map<string, number>());
          }
          const fileMap = globalStats.get(word)!;
          const currentFreq = fileMap.get(entry.name) ?? 0;
          fileMap.set(entry.name, currentFreq + 1);
        }
      } catch (error: any) {
        throw new Error(`Error procesando ${entry.name}: ${error.message}`);
      }
    }
  }

  // Sort tokens alphabetically
  const sortedTokens = [...globalStats.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  );

  // Build dictionary rows and posting rows
  const dictionaryRows: string[] = [];
  const postingRows: string[] = [];

  let postingPosition = 0;

  // Header for dictionary (Markdown)
  dictionaryRows.push(
    "| Token | Número de documentos | Posición en posting |",
  );
  dictionaryRows.push(
    "|-------|----------------------|---------------------|",
  );

  // Header for posting
  postingRows.push("Nombre del archivo\tFrecuencia");

  for (const [token, fileMap] of sortedTokens) {
    const docCount = fileMap.size;

    // Dictionary row
    dictionaryRows.push(`| ${token} | ${docCount} | ${postingPosition} |`);

    // Posting rows for this token
    for (const [filename, freq] of fileMap.entries()) {
      postingRows.push(`${filename}\t${freq}`);
    }

    // Next token's posting position = current position + number of docs
    postingPosition += docCount;
  }

  await writeTextFile(dictionaryFile, dictionaryRows.join("\n"));
  await writeTextFile(postingFile, postingRows.join("\n"));

  console.log(`Diccionario generado: ${dictionaryFile}`);
  console.log(`Posting generado:     ${postingFile}`);
};

await wordCounterTable();
export default wordCounterTable;
