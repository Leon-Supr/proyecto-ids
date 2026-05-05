const { readTextFile, readDir, writeTextFile } = Deno;

const dictionaryFile = "./a7_archivoPostingFiles/a7_dictionary.md";
const postingFile = "./a7_archivoPostingFiles/a7_posting.txt";
const logFile = "./a7_archivoPostingFiles/a7_leo.txt";

const wordCounterTable = async () => {
  const totalStart = performance.now();

  // Estructura Map: token -> Map<filename, frequency> es para saber cuantas veces apareció y en qué archivos
  const globalStats = new Map<string, Map<string, number>>();

  const timings: { filename: string; durationMs: number }[] = [];
  const logLines: string[] = []; //Guarda las lineas para el log

  for await (const entry of readDir("./FilesSortedWords")) { // Recorre todos los archivos de la carpeta FilesSortedWords de actividades anteriores
    if (entry.isFile && entry.name.endsWith(".txt")) {
      const fileStart = performance.now();

      try {
        const fileContent = await readTextFile(
          `./FilesSortedWords/${entry.name}`, // Lee su contenido
        );

        const words = fileContent // Separa el contenido en palabras
          .split("\n")
          .map((w) => w.trim().toLowerCase())
          .filter((w) => w.length > 0);

        // En qué archivo apareció y cuántas veces
        for (const word of words) {
          if (!globalStats.has(word)) { // Si no había registro, crea un mapa nuevo para el token
            globalStats.set(word, new Map<string, number>());
          }
          const fileMap = globalStats.get(word)!; // Obtiene el mapa de ese token
          const currentFreq = fileMap.get(entry.name) ?? 0; // Si había una frecuencia, la toma, si no, empieza en cero
          fileMap.set(entry.name, currentFreq + 1); // Y agrega +1
        }
      } catch (error: any) {
        throw new Error(`Error procesando ${entry.name}: ${error.message}`);
      }

      const fileEnd = performance.now();
      timings.push({
        filename: entry.name,
        durationMs: fileEnd - fileStart,
      });
    }
  }

  // Creación diccionario y posting
  // Ordena los tokens alfabéticamente con .sort
  const sortedTokens = [...globalStats.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  );

  // Arrays para las líneas de cada archivo de salida
  const dictionaryRows: string[] = [];
  const postingRows: string[] = [];

  let postingPosition = 0; //Lleva la posición de cada token en el posting, se incrementa sumanddo el número de documentos del token anterior

  // Formato para el md del diccionario
  dictionaryRows.push(
    "| Token | Número de documentos | Posición en posting |",
  );
  dictionaryRows.push(
    "|-------|----------------------|---------------------|",
  );

  // Formato para el txt del posting
  postingRows.push("Nombre del archivo\tFrecuencia");

  //Recorre cada token ordenado y crea sus filas en ambos archivos
  for (const [token, fileMap] of sortedTokens) {
    const docCount = fileMap.size; // Documentos diferentes que contienen el token

    // Agrega la fila del token al diccionario con su posición en el posting
    dictionaryRows.push(`| ${token} | ${docCount} | ${postingPosition} |`);

    // Agrega una fila al posting por cada archivo donde está el token
    for (const [filename, freq] of fileMap.entries()) {
      postingRows.push(`${filename}\t${freq}`);
    }

    //Avanzza la posición del posting para el siguiente token
    postingPosition += docCount;
  }

  const totalEnd = performance.now();
  const totalMs = totalEnd - totalStart;

  // Archivo Log

  logLines.push("# Log de procesamiento — a7_leo");
  logLines.push("");

  logLines.push("## Tiempos por archivo");
  logLines.push("| Archivo | Tiempo (ms) |");
  logLines.push("|---------|-------------|");

  for (const t of timings) {
    logLines.push(`| ${t.filename} | ${t.durationMs.toFixed(3)} |`);
  }

  logLines.push("");
  logLines.push(`| Tiempo total | ${totalMs.toFixed(3)} ms |`);

  
  await Deno.mkdir("./a7_archivoPostingFiles", { recursive: true });

  // Se crean los archivos de log
  await writeTextFile(dictionaryFile, dictionaryRows.join("\n"));
  await writeTextFile(postingFile, postingRows.join("\n"));
  await writeTextFile(logFile, logLines.join("\n"));

};

await wordCounterTable();
export default wordCounterTable;